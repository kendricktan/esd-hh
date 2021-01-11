import { ethers } from "hardhat";
import { expectBNEq, expectEventIn, expectRevert, BN } from "../Utils";

import {
  VOTE_PERIOD,
  EXPIRATION,
  EMERGENCY_COMMIT_PERIOD,
  UNDECIDED,
  APPROVE,
  REJECT,
  INITIAL_STAKE_MULTIPLE,
} from "../Constants";
import { Contract, ContractFactory, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expect } from "chai";

describe("Govern", function () {
  let [owner, user, user2, user3]: SignerWithAddress[] = [];

  let MockGovern: ContractFactory;
  let MockImplA: ContractFactory;
  let MockImplB: ContractFactory;

  let govern: Contract;

  let implA: Contract;
  let implB: Contract;

  before(async function () {
    [owner, user, user2, user3] = await ethers.getSigners();
    
    MockGovern = await ethers.getContractFactory("MockGovern");
    MockImplA = await ethers.getContractFactory("MockImplA");
    MockImplB = await ethers.getContractFactory("MockImplB");
  });

  beforeEach(async function () {
    govern = await MockGovern.connect(owner).deploy({ gasLimit: 8000000 });

    implA = await MockImplA.connect(owner).deploy({ gasLimit: 8000000 });
    implB = await MockImplB.connect(owner).deploy({ gasLimit: 8000000 });

    await govern.upgradeToE(implA.address);
    await govern.incrementEpochE();
  });

  describe("vote", function () {
    describe("cant vote", function () {
      describe("when no stake", function () {
        it("reverts", async function () {
          await expectRevert(govern.connect(user).vote(implB.address, APPROVE), "Govern: Must have stake");
        });
      });

      describe("when not enough stake to propose", function () {
        beforeEach(async function () {
          await govern.incrementBalanceOfE(user.address, INITIAL_STAKE_MULTIPLE.mul(BN(1)));
          await govern.incrementBalanceOfE(user2.address, INITIAL_STAKE_MULTIPLE.mul(BN(999)));
          await govern.incrementTotalBondedE(1000);
        });

        it("reverts", async function () {
          await expectRevert(govern.connect(user).vote(implB.address, APPROVE), "Govern: Not enough stake");
        });
      });

      describe("when ended", function () {
        beforeEach(async function () {
          await govern.incrementBalanceOfE(user.address, INITIAL_STAKE_MULTIPLE.mul(BN(1000)));
          await govern.incrementBalanceOfE(user2.address, INITIAL_STAKE_MULTIPLE.mul(BN(1000)));
          await govern.incrementTotalBondedE(2000);

          await govern.connect(user2).vote(implB.address, APPROVE);
          for (let i = 0; i < VOTE_PERIOD.toNumber(); i++) {
            await govern.incrementEpochE();
          }
        });

        it("is frozen", async function () {
          expectBNEq(await govern.statusOf(user.address), BN(0));
        });

        it("reverts", async function () {
          await expectRevert(govern.connect(user).vote(implB.address, APPROVE), "Govern: Ended");
        });
      });

      describe("when fluid", function () {
        beforeEach(async function () {
          await govern.unfreezeE(user.address);
        });

        it("is fluid", async function () {
          expectBNEq(await govern.statusOf(user.address), BN(1));
        });

        it("reverts", async function () {
          await expectRevert(govern.connect(user).vote(implB.address, APPROVE), "Permission: Not frozen or locked");
        });
      });
    });

    describe("can vote", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await govern.incrementBalanceOfE(user.address, INITIAL_STAKE_MULTIPLE.mul(BN(1000)));
        await govern.incrementBalanceOfE(user2.address, INITIAL_STAKE_MULTIPLE.mul(BN(1000)));
        await govern.incrementBalanceOfE(user3.address, INITIAL_STAKE_MULTIPLE.mul(BN(1000)));
        await govern.incrementTotalBondedE(3000);
      });

      describe("when vote", function () {
        beforeEach(async function () {
          const tx = await govern.connect(user).vote(implB.address, APPROVE);
          txRecp = await tx.wait();
        });

        it("sets vote counter correctly", async function () {
          expectBNEq(await govern.approveFor(implB.address), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await govern.rejectFor(implB.address), BN(0));
        });

        it("is nominated", async function () {
          expect(await govern.isNominated(implB.address)).to.be.equal(true);
        });

        it("records vote", async function () {
          expectBNEq(await govern.recordedVote(user.address, implB.address), APPROVE);
        });

        it("user is locked", async function () {
          expectBNEq(await govern.statusOf(user.address), BN(2));
        });

        it("emits Vote event", async function () {
          await expectEventIn(txRecp, "Vote", {
            account: user.address,
            candidate: implB.address,
            vote: APPROVE,
            bonded: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
          });
        });

        it("emits Proposal event", async function () {
          await expectEventIn(txRecp, "Proposal", {
            candidate: implB.address,
            account: user.address,
            start: BN(1),
            period: VOTE_PERIOD,
          });
        });
      });

      describe("when vote and wait", function () {
        beforeEach(async function () {
          await govern.connect(user).vote(implB.address, APPROVE);
        });

        describe("6 epochs", function () {
          beforeEach(async function () {
            for (let i = 0; i < 6; i++) {
              await govern.incrementEpochE();
            }
          });

          it("user is locked", async function () {
            expectBNEq(await govern.statusOf(user.address), BN(2));
          });
        });

        describe("vote period epochs", function () {
          beforeEach(async function () {
            for (let i = 0; i < VOTE_PERIOD.toNumber(); i++) {
              await govern.incrementEpochE();
            }
          });

          it("user is bonded", async function () {
            expectBNEq(await govern.statusOf(user.address), BN(0));
          });
        });
      });

      describe("when multiple vote", function () {
        beforeEach(async function () {
          await govern.connect(user2).vote(implB.address, REJECT);
          await govern.connect(user3).vote(implB.address, APPROVE);
          const tx = await govern.connect(user).vote(implB.address, APPROVE);
          txRecp = await tx.wait();
        });

        it("sets vote counter correctly", async function () {
          expectBNEq(await govern.approveFor(implB.address), BN(2000).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await govern.rejectFor(implB.address), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
        });

        it("is nominated", async function () {
          expect(await govern.isNominated(implB.address)).to.be.equal(true);
        });

        it("records vote", async function () {
          expectBNEq(await govern.recordedVote(user.address, implB.address), APPROVE);
          expectBNEq(await govern.recordedVote(user2.address, implB.address), REJECT);
          expectBNEq(await govern.recordedVote(user3.address, implB.address), APPROVE);
        });

        it("user is locked", async function () {
          expectBNEq(await govern.statusOf(user.address), BN(2));
          expectBNEq(await govern.statusOf(user2.address), BN(2));
          expectBNEq(await govern.statusOf(user3.address), BN(2));
        });

        it("emits Vote event", async function () {
          await expectEventIn(txRecp, "Vote", {
            account: user.address,
            candidate: implB.address,
            vote: APPROVE,
            bonded: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("when revote", function () {
        beforeEach(async function () {
          await govern.connect(user).vote(implB.address, APPROVE);
          await govern.connect(user2).vote(implB.address, REJECT);
          await govern.connect(user3).vote(implB.address, APPROVE);

          await govern.connect(user3).vote(implB.address, UNDECIDED);
          const tx = await govern.connect(user).vote(implB.address, REJECT);
          txRecp = await tx.wait();
        });

        it("sets vote counter correctly", async function () {
          expectBNEq(await govern.approveFor(implB.address), BN(0));
          expectBNEq(await govern.rejectFor(implB.address), BN(2000).mul(INITIAL_STAKE_MULTIPLE));
        });

        it("is nominated", async function () {
          expect(await govern.isNominated(implB.address)).to.be.equal(true);
        });

        it("records vote", async function () {
          expectBNEq(await govern.recordedVote(user.address, implB.address), REJECT);
          expectBNEq(await govern.recordedVote(user2.address, implB.address), REJECT);
          expectBNEq(await govern.recordedVote(user3.address, implB.address), UNDECIDED);
        });

        it("user is locked", async function () {
          expectBNEq(await govern.statusOf(user.address), BN(2));
          expectBNEq(await govern.statusOf(user2.address), BN(2));
          expectBNEq(await govern.statusOf(user3.address), BN(2));
        });

        it("emits Vote event", async function () {
          await expectEventIn(txRecp, "Vote", {
            account: user.address,
            candidate: implB.address,
            vote: REJECT,
            bonded: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });
    });
  });

  describe("commit", function () {
    beforeEach(async function () {
      await govern.incrementBalanceOfE(user.address, INITIAL_STAKE_MULTIPLE.mul(BN(2000)));
      await govern.incrementBalanceOfE(user2.address, INITIAL_STAKE_MULTIPLE.mul(BN(4500)));
      await govern.incrementBalanceOfE(user3.address, INITIAL_STAKE_MULTIPLE.mul(BN(3500)));
      await govern.incrementTotalBondedE(10000);
    });

    describe("before nomination", function () {
      it("is bonded", async function () {
        expect(await govern.isNominated(implB.address)).to.be.equal(false);
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).commit(implB.address), "Govern: Not nominated");
      });
    });

    describe("before ended", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, APPROVE);
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).commit(implB.address), "Govern: Not ended");
      });
    });

    describe("ended with not enough votes", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, APPROVE);
        for (let i = 0; i < VOTE_PERIOD.toNumber(); i++) {
          await govern.snapshotTotalBondedE();
          await govern.incrementEpochE();
        }
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).commit(implB.address), "Govern: Must have quorom");
      });
    });

    describe("ended with not enough approve votes", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, APPROVE);
        await govern.connect(user2).vote(implB.address, REJECT);
        for (let i = 0; i < VOTE_PERIOD.toNumber(); i++) {
          await govern.snapshotTotalBondedE();
          await govern.incrementEpochE();
        }
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).commit(implB.address), "Govern: Not approved");
      });
    });

    describe("ends successfully", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, REJECT);
        await govern.connect(user2).vote(implB.address, APPROVE);
        for (let i = 0; i < VOTE_PERIOD.toNumber(); i++) {
          await govern.snapshotTotalBondedE();
          await govern.incrementEpochE();
        }

        const tx = await govern.connect(user).commit(implB.address);
        txRecp = await tx.wait();
      });

      it("is updated", async function () {
        expect(await govern.implementation()).to.be.equal(implB.address);
        expect(await govern.isInitialized(implB.address)).to.be.equal(true);
      });

      it("emits Commit event", async function () {
        await expectEventIn(txRecp, "Commit", {
          account: user.address,
          candidate: implB.address,
        });
      });
    });

    describe("expired", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, REJECT);
        await govern.connect(user2).vote(implB.address, APPROVE);
        for (let i = 0; i < VOTE_PERIOD.add(EXPIRATION).toNumber(); i++) {
          await govern.snapshotTotalBondedE();
          await govern.incrementEpochE();
        }
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).commit(implB.address), "Govern: Expired");
      });
    });

    describe("double commit - probably not possible in practice", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, REJECT);
        await govern.connect(user2).vote(implB.address, APPROVE);

        for (let i = 0; i < VOTE_PERIOD.toNumber(); i++) {
          await govern.snapshotTotalBondedE();
          await govern.incrementEpochE();
        }

        await govern.connect(user).commit(implB.address);
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).commit(implB.address), "Permission: Already initialized");
      });
    });
  });

  describe("emergency commit", function () {
    beforeEach(async function () {
      await govern.incrementBalanceOfE(user.address, INITIAL_STAKE_MULTIPLE.mul(BN(2500)));
      await govern.incrementBalanceOfE(user2.address, INITIAL_STAKE_MULTIPLE.mul(BN(4000)));
      await govern.incrementBalanceOfE(user3.address, INITIAL_STAKE_MULTIPLE.mul(BN(3500)));
      await govern.incrementTotalBondedE(10000);

      const epoch = await govern.epoch();
      await govern.setEpochTime(epoch);
    });

    describe("before nomination", function () {
      it("is bonded", async function () {
        expect(await govern.isNominated(implB.address)).to.be.equal(false);
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).emergencyCommit(implB.address), "Govern: Not nominated");
      });
    });

    describe("while synced", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, APPROVE);
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).emergencyCommit(implB.address), "Govern: Epoch synced");
      });
    });

    describe("ended with not enough approve votes", function () {
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, APPROVE);
        await govern.connect(user3).vote(implB.address, APPROVE);
        await govern.connect(user2).vote(implB.address, REJECT);

        const epoch = await govern.epoch();
        await govern.setEpochTime(epoch + EMERGENCY_COMMIT_PERIOD);
      });

      it("reverts", async function () {
        await expectRevert(govern.connect(user).emergencyCommit(implB.address), "Govern: Must have super majority");
      });
    });

    describe("ends successfully", function () {
      let txRecp: ContractReceipt;
      beforeEach(async function () {
        await govern.connect(user).vote(implB.address, REJECT);
        await govern.connect(user2).vote(implB.address, APPROVE);
        await govern.connect(user3).vote(implB.address, APPROVE);

        const epoch = await govern.epoch();
        await govern.setEpochTime(epoch + EMERGENCY_COMMIT_PERIOD);

        const tx = await govern.connect(user).emergencyCommit(implB.address);
        txRecp = await tx.wait();
      });

      it("is updated", async function () {
        expect(await govern.implementation()).to.be.equal(implB.address);
        expect(await govern.isInitialized(implB.address)).to.be.equal(true);
      });

      it("emits Commit event", async function () {
        await expectEventIn(txRecp, "Commit", {
          account: user.address,
          candidate: implB.address,
        });
      });
    });
  });
});
