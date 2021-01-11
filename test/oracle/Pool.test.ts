import { ethers } from "hardhat";
import { expectBNEq, expectEventIn, expectRevert, BN } from "../Utils";

import { Contract, ContractFactory, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expect } from "chai";

const INITIAL_STAKE_MULTIPLE = BN(10).pow(BN(6)); // 100 ESD -> 100M ESDS

const FROZEN = BN(0);
const FLUID = BN(1);

async function incrementEpoch(dao) {
  await dao.set((await dao.epoch()).toNumber() + 1);
}

describe("Pool", function () {
  let [owner, user, user1, user2, mockDao]: SignerWithAddress[] = [];

  let MockPool: ContractFactory;
  let MockToken: ContractFactory;
  let MockUniswapV2PairLiquidity: ContractFactory;
  let MockSettableDAO: ContractFactory;

  let dao: Contract;
  let usdc: Contract;
  let dollar: Contract;
  let univ2: Contract;
  let pool: Contract;

  before(async function () {
    [owner, user, user1, user2, mockDao] = await ethers.getSigners();

    MockPool = await ethers.getContractFactory("MockPool");
    MockToken = await ethers.getContractFactory("MockToken");
    MockUniswapV2PairLiquidity = await ethers.getContractFactory("MockUniswapV2PairLiquidity");
    MockSettableDAO = await ethers.getContractFactory("MockSettableDAO");
  });

  beforeEach(async function () {
    dao = await MockSettableDAO.connect(owner).deploy({ gasLimit: 8000000 });
    await dao.set(1);

    dollar = await MockToken.connect(owner).deploy("Empty Set Dollar", "ESD", 18, { gasLimit: 8000000 });
    usdc = await MockToken.connect(owner).deploy("USD//C", "USDC", 18, { gasLimit: 8000000 });
    univ2 = await MockUniswapV2PairLiquidity.connect(owner).deploy({ gasLimit: 8000000 });
    pool = await MockPool.connect(owner).deploy(usdc.address, { gasLimit: 8000000 });
    await pool.set(dao.address, dollar.address, univ2.address);
  });

  describe("frozen", function () {
    describe("starts as frozen", function () {
      it("mints new Dollar tokens", async function () {
        expectBNEq(await pool.statusOf(user.address), FROZEN);
      });
    });

    describe("when deposit", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await univ2.faucet(user.address, 1000);
        await univ2.connect(user).approve(pool.address, 1000);

        const tx = await pool.connect(user).deposit(1000);
        txRecp = await tx.wait();
      });

      it("is frozen", async function () {
        expectBNEq(await pool.statusOf(user.address), FROZEN);
      });

      it("updates users balances", async function () {
        expectBNEq(await univ2.balanceOf(user.address), BN(0));
        expectBNEq(await pool.balanceOfStaged(user.address), BN(1000));
        expectBNEq(await pool.balanceOfBonded(user.address), BN(0));
      });

      it("updates dao balances", async function () {
        expectBNEq(await univ2.balanceOf(pool.address), BN(1000));
        expectBNEq(await pool.totalBonded(), BN(0));
        expectBNEq(await pool.totalStaged(), BN(1000));
      });

      it("emits Deposit event", async function () {
        await expectEventIn(txRecp, "Deposit", {
          account: user.address,
          value: BN(1000),
        });
      });
    });

    describe("when withdraw", function () {
      describe("simple", function () {
        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await univ2.faucet(user.address, 1000);
          await univ2.connect(user).approve(pool.address, 1000);
          await pool.connect(user).deposit(1000);

          const tx = await pool.connect(user).withdraw(1000);
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await pool.statusOf(user.address), FROZEN);
        });

        it("updates users balances", async function () {
          expectBNEq(await univ2.balanceOf(user.address), BN(1000));
          expectBNEq(await pool.balanceOfStaged(user.address), BN(0));
          expectBNEq(await pool.balanceOfBonded(user.address), BN(0));
        });

        it("updates dao balances", async function () {
          expectBNEq(await univ2.balanceOf(pool.address), BN(0));
          expectBNEq(await pool.totalBonded(), BN(0));
          expectBNEq(await pool.totalStaged(), BN(0));
        });

        it("emits Withdraw event", async function () {
          await expectEventIn(txRecp, "Withdraw", {
            account: user.address,
            value: BN(1000),
          });
        });
      });

      describe("too much", function () {
        beforeEach(async function () {
          await univ2.faucet(user.address, 1000);
          await univ2.connect(user).approve(pool.address, 1000);
          await pool.connect(user).deposit(1000);

          await univ2.faucet(user1.address, 10000);
          await univ2.connect(user1).approve(pool.address, 10000);
          await pool.connect(user1).deposit(10000);
        });

        it("reverts", async function () {
          await expectRevert(pool.connect(user).withdraw(2000), "insufficient staged balance");
        });
      });
    });

    describe("when claim", function () {
      beforeEach(async function () {
        await univ2.faucet(user.address, 1000);
        await univ2.connect(user).approve(pool.address, 1000);
        await pool.connect(user).deposit(1000);
        await pool.connect(user).bond(1000);
        await dao.set((await dao.epoch()) + 1);
        await dollar.mint(pool.address, 1000);
        await pool.connect(user).unbond(1000);
        await dao.set((await dao.epoch()) + 1);
      });

      describe("simple", function () {
        let txRecp: ContractReceipt;
        beforeEach(async function () {
          const tx = await pool.connect(user).claim(1000);
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await pool.statusOf(user.address), FROZEN);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(1000));
          expectBNEq(await pool.balanceOfClaimable(user.address), BN(0));
          expectBNEq(await pool.balanceOfRewarded(user.address), BN(0));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          expectBNEq(await pool.totalClaimable(), BN(0));
          expectBNEq(await pool.totalRewarded(), BN(0));
        });

        it("emits Claim event", async function () {
          await expectEventIn(txRecp, "Claim", {
            account: user.address,
            value: BN(1000),
          });
        });
      });

      describe("too much", function () {
        beforeEach(async function () {
          await dollar.mint(pool.address, 1000);
        });

        it("reverts", async function () {
          await expectRevert(pool.connect(user).claim(2000), "insufficient claimable balance");
        });
      });
    });

    describe("when bond", function () {
      describe("no reward", function () {
        describe("simple", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user.address, 1000);
            await univ2.connect(user).approve(pool.address, 1000);
            await pool.connect(user).deposit(1000);

            const tx = await pool.connect(user).bond(1000);
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await univ2.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfStaged(user.address), BN(0));
            expectBNEq(await pool.balanceOfBonded(user.address), BN(1000));
          });

          it("updates dao balances", async function () {
            expectBNEq(await univ2.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalBonded(), BN(1000));
            expectBNEq(await pool.totalStaged(), BN(0));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(2),
              value: BN(1000),
            });
          });
        });

        describe("partial", function () {
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await univ2.faucet(user.address, 1000);
            await univ2.connect(user).approve(pool.address, 1000);
            await pool.connect(user).deposit(800);

            const tx = await pool.connect(user).bond(500);
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await univ2.balanceOf(user.address), BN(200));
            expectBNEq(await pool.balanceOfStaged(user.address), BN(300));
            expectBNEq(await pool.balanceOfBonded(user.address), BN(500));
          });

          it("updates dao balances", async function () {
            expectBNEq(await univ2.balanceOf(pool.address), BN(800));
            expectBNEq(await pool.totalBonded(), BN(500));
            expectBNEq(await pool.totalStaged(), BN(300));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(2),
              value: BN(500),
            });
          });
        });

        describe("multiple", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user1.address, 1000);
            await univ2.connect(user1).approve(pool.address, 1000);
            await pool.connect(user1).deposit(1000);

            await univ2.faucet(user2.address, 1000);
            await univ2.connect(user2).approve(pool.address, 1000);
            await pool.connect(user2).deposit(1000);

            await pool.connect(user1).bond(600);
            await pool.connect(user2).bond(400);

            await incrementEpoch(dao);

            await univ2.faucet(user.address, 1000);
            await univ2.connect(user).approve(pool.address, 800);
            await pool.connect(user).deposit(800);

            const tx = await pool.connect(user).bond(500);
            txRecp = await tx.wait();
          });

          it("is frozen", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await univ2.balanceOf(user.address), BN(200));
            expectBNEq(await pool.balanceOfStaged(user.address), BN(300));
            expectBNEq(await pool.balanceOfBonded(user.address), BN(500));
          });

          it("updates dao balances", async function () {
            expectBNEq(await univ2.balanceOf(pool.address), BN(2800));
            expectBNEq(await pool.totalBonded(), BN(1500));
            expectBNEq(await pool.totalStaged(), BN(1300));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(3),
              value: BN(500),
            });
          });
        });
      });

      describe("with reward", function () {
        describe("before bonding", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user.address, 1000);
            await dollar.mint(pool.address, 1000);
            await univ2.connect(user).approve(pool.address, 1000);
            await pool.connect(user).deposit(1000);

            const tx = await pool.connect(user).bond(1000);
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfClaimable(user.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(1000));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalClaimable(), BN(0));
            expectBNEq(await pool.totalRewarded(), BN(1000));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(2),
              value: BN(1000),
            });
          });
        });

        describe("after bond", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user.address, 1000);
            await univ2.connect(user).approve(pool.address, 1000);
            await pool.connect(user).deposit(800);

            const tx = await pool.connect(user).bond(500);
            txRecp = await tx.wait();

            await dollar.mint(pool.address, 1000);
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfClaimable(user.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(1000));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalClaimable(), BN(0));
            expectBNEq(await pool.totalRewarded(), BN(1000));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(2),
              value: BN(500),
            });
          });
        });

        describe("multiple with reward first", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user1.address, 1000);
            await dollar.mint(pool.address, BN(1000));
            await univ2.connect(user1).approve(pool.address, 1000);
            await pool.connect(user1).deposit(1000);

            await univ2.faucet(user2.address, 1000);
            await univ2.connect(user2).approve(pool.address, 1000);
            await pool.connect(user2).deposit(1000);

            await pool.connect(user1).bond(600);
            await pool.connect(user2).bond(400);

            await incrementEpoch(dao);
            await dollar.mint(pool.address, BN(1000));

            await univ2.faucet(user.address, 1000);
            await univ2.connect(user).approve(pool.address, 800);
            await pool.connect(user).deposit(800);

            const tx = await pool.connect(user).bond(500);
            txRecp = await tx.wait();
          });

          it("is frozen", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user1.address), BN(1599));
            expectBNEq(await pool.balanceOfPhantom(user1.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user2.address), BN(400));
            expectBNEq(await pool.balanceOfPhantom(user2.address), BN(666));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(0));
            expectBNEq(await pool.balanceOfPhantom(user.address), BN(1333));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(2000));
            expectBNEq(await pool.totalRewarded(), BN(2000));
            expectBNEq(await pool.totalPhantom(), BN(1999));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(3),
              value: BN(500),
            });
          });
        });

        describe("multiple without reward first", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user1.address, 1000);
            await univ2.connect(user1).approve(pool.address, 1000);
            await pool.connect(user1).deposit(1000);

            await univ2.faucet(user2.address, 1000);
            await univ2.connect(user2).approve(pool.address, 1000);
            await pool.connect(user2).deposit(1000);

            await pool.connect(user1).bond(600);
            await pool.connect(user2).bond(400);

            await incrementEpoch(dao);
            await dollar.mint(pool.address, BN(1000).mul(INITIAL_STAKE_MULTIPLE));

            await univ2.faucet(user.address, 1000);
            await univ2.connect(user).approve(pool.address, 800);
            await pool.connect(user).deposit(800);

            const tx = await pool.connect(user).bond(500);
            txRecp = await tx.wait();
          });

          it("is frozen", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user1.address), BN(600).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.balanceOfPhantom(user1.address), BN(600).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.balanceOfRewarded(user2.address), BN(400).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.balanceOfPhantom(user2.address), BN(400).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(0));
            expectBNEq(await pool.balanceOfPhantom(user.address), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.totalRewarded(), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.totalPhantom(), BN(2000).mul(INITIAL_STAKE_MULTIPLE));
          });

          it("emits Bond event", async function () {
            await expectEventIn(txRecp, "Bond", {
              account: user.address,
              start: BN(3),
              value: BN(500),
            });
          });
        });
      });
    });

    describe("when unbond", function () {
      describe("without reward", function () {
        beforeEach(async function () {
          await univ2.faucet(user.address, 1000);
          await univ2.connect(user).approve(pool.address, 1000);
          await pool.connect(user).deposit(1000);

          await pool.connect(user).bond(1000);
          await incrementEpoch(dao);
        });

        describe("simple", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            const tx = await pool.connect(user).unbond(BN(1000));
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await univ2.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfStaged(user.address), BN(1000));
            expectBNEq(await pool.balanceOfBonded(user.address), BN(0));
          });

          it("updates dao balances", async function () {
            expectBNEq(await univ2.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalBonded(), BN(0));
            expectBNEq(await pool.totalStaged(), BN(1000));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(3),
              value: BN(1000),
              newClaimable: BN(0),
            });
          });
        });

        describe("partial", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            const tx = await pool.connect(user).unbond(BN(800));
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await univ2.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfStaged(user.address), BN(800));
            expectBNEq(await pool.balanceOfBonded(user.address), BN(200));
          });

          it("updates dao balances", async function () {
            expectBNEq(await univ2.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalBonded(), BN(200));
            expectBNEq(await pool.totalStaged(), BN(800));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(3),
              value: BN(800),
              newClaimable: BN(0),
            });
          });
        });

        describe("multiple", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user1.address, 1000);
            await univ2.connect(user1).approve(pool.address, 1000);
            await pool.connect(user1).deposit(1000);

            await univ2.faucet(user2.address, 1000);
            await univ2.connect(user2).approve(pool.address, 1000);
            await pool.connect(user2).deposit(1000);

            await pool.connect(user1).bond(600);
            await pool.connect(user2).bond(400);

            await incrementEpoch(dao);

            const tx = await pool.connect(user).unbond(BN(800));
            txRecp = await tx.wait();
          });

          it("is frozen", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await univ2.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfStaged(user.address), BN(800));
            expectBNEq(await pool.balanceOfBonded(user.address), BN(200));
          });

          it("updates dao balances", async function () {
            expectBNEq(await univ2.balanceOf(pool.address), BN(3000));
            expectBNEq(await pool.totalBonded(), BN(1200));
            expectBNEq(await pool.totalStaged(), BN(1800));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(4),
              value: BN(800),
              newClaimable: BN(0),
            });
          });
        });
      });

      describe("with reward", function () {
        beforeEach(async function () {
          await univ2.faucet(user.address, 1000);
          await univ2.connect(user).approve(pool.address, 1000);
          await pool.connect(user).deposit(1000);

          await pool.connect(user).bond(1000);
          await incrementEpoch(dao);
          await dollar.mint(pool.address, 1000);
        });

        describe("simple", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            const tx = await pool.connect(user).unbond(BN(1000));
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfClaimable(user.address), BN(1000));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(0));
            expectBNEq(await pool.balanceOfPhantom(user.address), BN(0));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalClaimable(), BN(1000));
            expectBNEq(await pool.totalRewarded(), BN(0));
            expectBNEq(await pool.totalPhantom(), BN(0));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(3),
              value: BN(1000),
              newClaimable: BN(1000),
            });
          });
        });

        describe("partial", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            const tx = await pool.connect(user).unbond(BN(800));
            txRecp = await tx.wait();
          });

          it("is fluid", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfClaimable(user.address), BN(800));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(200));
            expectBNEq(await pool.balanceOfPhantom(user.address), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(1000));
            expectBNEq(await pool.totalClaimable(), BN(800));
            expectBNEq(await pool.totalRewarded(), BN(200));
            expectBNEq(await pool.totalPhantom(), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(3),
              value: BN(800),
              newClaimable: BN(800),
            });
          });
        });

        describe("multiple", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await univ2.faucet(user1.address, 1000);
            await univ2.connect(user1).approve(pool.address, 1000);
            await pool.connect(user1).deposit(1000);

            await univ2.faucet(user2.address, 1000);
            await univ2.connect(user2).approve(pool.address, 1000);
            await pool.connect(user2).deposit(1000);

            await pool.connect(user1).bond(600);
            await pool.connect(user2).bond(400);

            await incrementEpoch(dao);
            await dollar.mint(pool.address, 1000);

            const tx = await pool.connect(user).unbond(BN(800));
            txRecp = await tx.wait();
          });

          it("is frozen", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfClaimable(user.address), BN(1200));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(300));
            expectBNEq(await pool.balanceOfPhantom(user.address), BN(200).mul(INITIAL_STAKE_MULTIPLE));
            expectBNEq(await pool.balanceOfClaimable(user1.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user1.address), BN(300));
            expectBNEq(await pool.balanceOfPhantom(user1.address), BN(600).mul(INITIAL_STAKE_MULTIPLE).add(BN(600)));
            expectBNEq(await pool.balanceOfClaimable(user2.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user2.address), BN(200));
            expectBNEq(await pool.balanceOfPhantom(user2.address), BN(400).mul(INITIAL_STAKE_MULTIPLE).add(BN(400)));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(2000));
            expectBNEq(await pool.totalClaimable(), BN(1200));
            expectBNEq(await pool.totalRewarded(), BN(800));
            expectBNEq(await pool.totalPhantom(), BN(1200).mul(INITIAL_STAKE_MULTIPLE).add(BN(1000)));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(4),
              value: BN(800),
              newClaimable: BN(1200),
            });
          });
        });

        describe("potential subtraction underflow", function () {
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await univ2.faucet(user1.address, 1000);
            await univ2.connect(user1).approve(pool.address, 1000);
            await pool.connect(user1).deposit(1000);

            await univ2.faucet(user2.address, 1000);
            await univ2.connect(user2).approve(pool.address, 1000);
            await pool.connect(user2).deposit(1000);

            await pool.connect(user1).bond(600);
            await pool.connect(user2).bond(500);

            await incrementEpoch(dao);
            await dollar.mint(pool.address, 1000);

            await pool.connect(user).unbond(BN(1000));
            await pool.connect(user).bond(BN(1000));
            await pool.connect(user).unbond(BN(600));

            const tx = await pool.connect(user).unbond(BN(200));
            txRecp = await tx.wait();
          });

          it("is frozen", async function () {
            expectBNEq(await pool.statusOf(user.address), FLUID);
          });

          it("updates users balances", async function () {
            expectBNEq(await dollar.balanceOf(user.address), BN(0));
            expectBNEq(await pool.balanceOfClaimable(user.address), BN(1476));
            expectBNEq(await pool.balanceOfRewarded(user.address), BN(0));
            expectBNEq(await pool.balanceOfPhantom(user.address), BN(200).mul(INITIAL_STAKE_MULTIPLE).add(BN(296)));
            expectBNEq(await pool.balanceOfClaimable(user1.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user1.address), BN(286));
            expectBNEq(await pool.balanceOfPhantom(user1.address), BN(600).mul(INITIAL_STAKE_MULTIPLE).add(BN(600)));
            expectBNEq(await pool.balanceOfClaimable(user2.address), BN(0));
            expectBNEq(await pool.balanceOfRewarded(user2.address), BN(238));
            expectBNEq(await pool.balanceOfPhantom(user2.address), BN(500).mul(INITIAL_STAKE_MULTIPLE).add(BN(500)));
          });

          it("updates dao balances", async function () {
            expectBNEq(await dollar.balanceOf(pool.address), BN(2000));
            expectBNEq(await pool.totalClaimable(), BN(1476));
            expectBNEq(await pool.totalRewarded(), BN(524));
            expectBNEq(await pool.totalPhantom(), BN(1300).mul(INITIAL_STAKE_MULTIPLE).add(BN(1396)));
          });

          it("emits Unbond event", async function () {
            await expectEventIn(txRecp, "Unbond", {
              account: user.address,
              start: BN(4),
              value: BN(200),
              newClaimable: BN(0),
            });
          });
        });
      });
    });

    describe("when provide", function () {
      beforeEach(async function () {
        await univ2.faucet(user.address, 1000);
        await univ2.connect(user).approve(pool.address, 1000);
        await pool.connect(user).deposit(1000);
        await pool.connect(user).bond(1000);

        const poolLockupEpochs = 5;
        for (let i = 0; i < poolLockupEpochs; i++) {
          await incrementEpoch(dao);
        }
        await dollar.mint(pool.address, 1000);
      });

      describe("not enough rewards", function () {
        it("reverts", async function () {
          await expectRevert(pool.connect(user).provide(2000), "Pool: insufficient rewarded balance");
        });
      });

      describe("simple", function () {
        let txRecp: ContractReceipt;

        const phantomAfterLessReward = BN(1000).mul(INITIAL_STAKE_MULTIPLE).add(BN(1000));
        const phantomAfterNewBonded = phantomAfterLessReward.add(BN(10).mul(INITIAL_STAKE_MULTIPLE).add(BN(10)));

        beforeEach(async function () {
          await usdc.mint(user.address, 1000);
          await usdc.connect(user).approve(pool.address, 1000);

          await univ2.set(1000, 1000, 10);

          const tx = await pool.connect(user).provide(1000);
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await pool.statusOf(user.address), FROZEN);
        });

        it("updates users balances", async function () {
          expectBNEq(await univ2.balanceOf(user.address), BN(0));
          expectBNEq(await pool.balanceOfStaged(user.address), BN(0));
          expectBNEq(await pool.balanceOfClaimable(user.address), BN(0));
          expectBNEq(await pool.balanceOfBonded(user.address), BN(1010));
          expectBNEq(await pool.balanceOfRewarded(user.address), BN(0));
          expectBNEq(await pool.balanceOfPhantom(user.address), phantomAfterNewBonded);
        });

        it("updates dao balances", async function () {
          expectBNEq(await univ2.balanceOf(pool.address), BN(1010));
          expectBNEq(await pool.totalStaged(), BN(0));
          expectBNEq(await pool.totalClaimable(), BN(0));
          expectBNEq(await pool.totalBonded(), BN(1010));
          expectBNEq(await pool.totalRewarded(), BN(0));
          expectBNEq(await pool.totalPhantom(), phantomAfterNewBonded);
        });

        it("emits Deposit event", async function () {
          await expectEventIn(txRecp, "Provide", {
            account: user.address,
            value: BN(1000),
            lessUsdc: BN(1000),
            newUniv2: BN(10),
          });
        });
      });

      describe("complex", function () {
        let txRecp: ContractReceipt;

        const phantomAfterLessReward = BN(1000).mul(INITIAL_STAKE_MULTIPLE).add(BN(1000));
        const phantomAfterNewBonded = phantomAfterLessReward.add(BN(10).mul(INITIAL_STAKE_MULTIPLE).add(BN(15)));
        const totalPhantom = phantomAfterNewBonded.add(BN(1000).mul(INITIAL_STAKE_MULTIPLE).add(BN(1000)));

        beforeEach(async function () {
          await usdc.mint(user.address, 3000);
          await usdc.connect(user).approve(pool.address, 3000);

          await univ2.faucet(user1.address, 1000);
          await univ2.connect(user1).approve(pool.address, 1000);
          await pool.connect(user1).deposit(1000);
          await pool.connect(user1).bond(1000);

          await incrementEpoch(dao);
          await dollar.mint(pool.address, 1000);

          // 1000 ESD + 3000 USDC
          await univ2.set(1000, 3000, 10);

          const tx = await pool.connect(user).provide(1000);
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await pool.statusOf(user.address), FROZEN);
        });

        it("updates users balances", async function () {
          expectBNEq(await univ2.balanceOf(user.address), BN(0));
          expectBNEq(await pool.balanceOfStaged(user.address), BN(0));
          expectBNEq(await pool.balanceOfClaimable(user.address), BN(0));
          expectBNEq(await pool.balanceOfBonded(user.address), BN(1010));
          expectBNEq(await pool.balanceOfRewarded(user.address), BN(500));
          expectBNEq(await pool.balanceOfPhantom(user.address), phantomAfterNewBonded);
        });

        it("updates dao balances", async function () {
          expectBNEq(await univ2.balanceOf(pool.address), BN(2010));
          expectBNEq(await pool.totalStaged(), BN(0));
          expectBNEq(await pool.totalClaimable(), BN(0));
          expectBNEq(await pool.totalBonded(), BN(2010));
          expectBNEq(await pool.totalRewarded(), BN(1000));
          expectBNEq(await pool.totalPhantom(), totalPhantom);
        });

        it("emits Deposit event", async function () {
          await expectEventIn(txRecp, "Provide", {
            account: user.address,
            value: BN(1000),
            lessUsdc: BN(3000),
            newUniv2: BN(10),
          });
        });
      });
    });
  });

  describe("fluid", function () {
    beforeEach(async function () {
      await dollar.mint(pool.address, 1000);
      await univ2.faucet(user.address, 1000);
      await univ2.connect(user).approve(pool.address, 1000);
      await pool.connect(user).deposit(1000);

      await pool.connect(user).bond(500);
    });

    it("is fluid", async function () {
      expectBNEq(await pool.statusOf(user.address), FLUID);
    });

    describe("when deposit", function () {
      it("reverts", async function () {
        await expectRevert(pool.connect(user).deposit(1000), "Pool: Not frozen");
      });
    });

    describe("when withdraw", function () {
      it("reverts", async function () {
        await expectRevert(pool.connect(user).withdraw(1000), "Pool: Not frozen");
      });
    });

    describe("when claim", function () {
      it("reverts", async function () {
        await expectRevert(pool.connect(user).claim(1000), "Pool: Not frozen");
      });
    });

    describe("when provide", function () {
      it("reverts", async function () {
        await expectRevert(pool.connect(user).provide(1000), "Pool: Not frozen");
      });
    });

    describe("when bond", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        const tx = await pool.connect(user).bond(500);
        txRecp = await tx.wait();
      });

      it("is fluid", async function () {
        expectBNEq(await pool.statusOf(user.address), FLUID);
      });

      it("updates users balances", async function () {
        expectBNEq(await univ2.balanceOf(user.address), BN(0));
        expectBNEq(await pool.balanceOfStaged(user.address), BN(0));
        expectBNEq(await pool.balanceOfBonded(user.address), BN(1000));
      });

      it("updates dao balances", async function () {
        expectBNEq(await univ2.balanceOf(pool.address), BN(1000));
        expectBNEq(await pool.totalBonded(), BN(1000));
        expectBNEq(await pool.totalStaged(), BN(0));
      });

      it("emits Bond event", async function () {
        await expectEventIn(txRecp, "Bond", {
          account: user.address,
          start: BN(2),
          value: BN(500),
        });
      });
    });

    describe("when unbond", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        const tx = await pool.connect(user).unbond(BN(500));
        txRecp = await tx.wait();
      });

      it("is fluid", async function () {
        expectBNEq(await pool.statusOf(user.address), FLUID);
      });

      it("updates users balances", async function () {
        expectBNEq(await univ2.balanceOf(user.address), BN(0));
        expectBNEq(await pool.balanceOfStaged(user.address), BN(1000));
        expectBNEq(await pool.balanceOfBonded(user.address), BN(0));
      });

      it("updates dao balances", async function () {
        expectBNEq(await univ2.balanceOf(pool.address), BN(1000));
        expectBNEq(await pool.totalBonded(), BN(0));
        expectBNEq(await pool.totalStaged(), BN(1000));
      });

      it("emits Unbond event", async function () {
        await expectEventIn(txRecp, "Unbond", {
          account: user.address,
          start: BN(2),
          value: BN(500),
          newClaimable: BN(1000),
        });
      });
    });
  });

  describe("when pause", function () {
    beforeEach(async function () {
      await univ2.faucet(user.address, 1000);
      await univ2.connect(user).approve(pool.address, 1000);
      await pool.connect(user).deposit(1000);
      await pool.connect(user).bond(1000);
      await dao.set((await dao.epoch()) + 1);
      await dollar.mint(pool.address, 1000);
      await pool.connect(user).unbond(500);
      await dao.set((await dao.epoch()) + 1);
    });

    describe("as dao", function () {
      beforeEach(async function () {
        await pool.set(mockDao.address, dollar.address, univ2.address);
        await pool.connect(mockDao).emergencyPause();
        await pool.set(dao.address, dollar.address, univ2.address);
      });

      it("is paused", async function () {
        expect(await pool.paused()).to.be.equal(true);
      });

      it("reverts on deposit", async function () {
        await expectRevert(pool.connect(user).deposit(2000), "Paused");
      });

      it("reverts on bond", async function () {
        await expectRevert(pool.connect(user).bond(2000), "Paused");
      });

      it("reverts on provide", async function () {
        await expectRevert(pool.connect(user).provide(2000), "Paused");
      });

      describe("withdraw", function () {
        beforeEach(async function () {
          await pool.connect(user).withdraw(200);
        });

        it("basic withdraw check", async function () {
          expectBNEq(await univ2.balanceOf(user.address), BN(200));
        });
      });

      describe("unbond", function () {
        beforeEach(async function () {
          await pool.connect(user).unbond(200);
        });

        it("basic unbond check", async function () {
          expectBNEq(await pool.balanceOfStaged(user.address), BN(700));
          expectBNEq(await pool.balanceOfClaimable(user.address), BN(700));
        });
      });

      describe("claim", function () {
        beforeEach(async function () {
          await pool.connect(user).claim(200);
        });

        it("basic claim check", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(200));
        });
      });
    });

    describe("as not dao", function () {
      it("reverts", async function () {
        await expectRevert(pool.connect(user).emergencyPause(), "Not dao");
      });
    });
  });

  describe("when emergency withdraw", function () {
    beforeEach(async function () {
      await univ2.faucet(user.address, 1000);
      await univ2.connect(user).approve(pool.address, 1000);
      await pool.connect(user).deposit(1000);
      await pool.connect(user).bond(1000);
      await dao.set((await dao.epoch()) + 1);
      await dollar.mint(pool.address, 1000);
    });

    describe("as dao", function () {
      beforeEach(async function () {
        await pool.set(mockDao.address, dollar.address, univ2.address);
        await pool.connect(mockDao).emergencyWithdraw(univ2.address, 1000);
        await pool.connect(mockDao).emergencyWithdraw(dollar.address, 1000);
      });

      it("transfers funds to the dao", async function () {
        expectBNEq(await univ2.balanceOf(mockDao.address), BN(1000));
        expectBNEq(await univ2.balanceOf(pool.address), BN(0));
        expectBNEq(await dollar.balanceOf(mockDao.address), BN(1000));
        expectBNEq(await dollar.balanceOf(pool.address), BN(0));
      });
    });

    describe("as not dao", function () {
      it("reverts", async function () {
        await expectRevert(pool.connect(user).emergencyWithdraw(univ2.address, 1000), "Not dao");
      });
    });
  });
});
