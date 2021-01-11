import { ethers } from "hardhat";
import { increaseTime, getLatestBlockTime, expectBNEq, expectEventIn, expectRevert, BN } from "../Utils";

import { FROZEN, FLUID, LOCKED, INITIAL_STAKE_MULTIPLE } from "../Constants";
import { Contract, ContractFactory, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expect } from "chai";

describe("Bonding", function () {
  let [owner, user, user1, user2]: SignerWithAddress[] = [];
  let MockBonding: ContractFactory;

  let bonding: Contract;
  let dollar: Contract;

  before(async function () {
    [owner, user, user1, user2] = await ethers.getSigners();
    MockBonding = await ethers.getContractFactory("MockBonding");
  });

  beforeEach(async function () {
    bonding = await MockBonding.connect(owner).deploy({ gasLimit: 8000000 });
    dollar = await ethers.getContractAt("Dollar", await bonding.dollar());

    await bonding.setEpochParamsE(await getLatestBlockTime(), 86400);
    await increaseTime(86400);
    await bonding.stepE();
  });

  describe("frozen", function () {
    let txRecp: ContractReceipt;

    it("starts as frozen", async function () {
      expectBNEq(await bonding.statusOf(user.address), FROZEN);
    });

    describe("when deposit", function () {
      beforeEach(async function () {
        await bonding.mintToE(user.address, 1000);
        await dollar.connect(user).approve(bonding.address, 1000);

        const tx = await bonding.connect(user).deposit(1000);
        txRecp = await tx.wait();
      });

      it("is frozen", async function () {
        expectBNEq(await bonding.statusOf(user.address), FROZEN);
      });

      it("updates users balances", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(0));
        expectBNEq(await bonding.balanceOf(user.address), BN(0));
        expectBNEq(await bonding.balanceOfStaged(user.address), BN(1000));
        expectBNEq(await bonding.balanceOfBonded(user.address), BN(0));
      });

      it("updates dao balances", async function () {
        expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
        expectBNEq(await bonding.totalSupply(), BN(0));
        expectBNEq(await bonding.totalBonded(), BN(0));
        expectBNEq(await bonding.totalStaged(), BN(1000));
      });

      it("emits Deposit event", async function () {
        expectEventIn(txRecp, "Deposit", {
          account: user.address,
          value: BN(1000),
        });
      });
    });

    describe("when withdraw", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await bonding.mintToE(user.address, 1000);
        await dollar.connect(user).approve(bonding.address, 1000);
        await bonding.connect(user).deposit(1000);

        const tx = await bonding.connect(user).withdraw(1000);
        txRecp = await tx.wait();
      });

      it("is frozen", async function () {
        expectBNEq(await bonding.statusOf(user.address), FROZEN);
      });

      it("updates users balances", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(1000));
        expectBNEq(await bonding.balanceOf(user.address), BN(0));
        expectBNEq(await bonding.balanceOfStaged(user.address), BN(0));
        expectBNEq(await bonding.balanceOfBonded(user.address), BN(0));
      });

      it("updates dao balances", async function () {
        expectBNEq(await dollar.balanceOf(bonding.address), BN(0));
        expectBNEq(await bonding.totalSupply(), BN(0));
        expectBNEq(await bonding.totalBonded(), BN(0));
        expectBNEq(await bonding.totalStaged(), BN(0));
      });

      it("emits Withdraw event", async function () {
        expectEventIn(txRecp, "Withdraw", {
          account: user.address,
          value: BN(1000),
        });
      });
    });

    describe("when withdraw too much", function () {
      beforeEach(async function () {
        await bonding.mintToE(user.address, 1000);
        await dollar.connect(user).approve(bonding.address, 1000);
        await bonding.connect(user).deposit(1000);

        await bonding.mintToE(user1.address, 10000);
        await dollar.connect(user1).approve(bonding.address, 10000);
        await bonding.connect(user1).deposit(10000);
      });

      it("reverts", async function () {
        await expectRevert(bonding.connect(user).withdraw(2000), "insufficient staged balance");
      });
    });

    describe("when bond", function () {
      describe("simple", function () {
        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await bonding.mintToE(user.address, 1000);
          await dollar.connect(user).approve(bonding.address, 1000);
          await bonding.connect(user).connect(user).connect(user).deposit(1000);

          const tx = await bonding.connect(user).bond(1000);
          txRecp = await tx.wait();
        });

        it("is fluid", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(0));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(1000));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
          expectBNEq(await bonding.totalSupply(), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.totalBonded(), BN(1000));
          expectBNEq(await bonding.totalStaged(), BN(0));
        });

        it("emits Bond event", async function () {
          await expectEventIn(txRecp, "Bond", {
            account: user.address,
            start: BN(2),
            value: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(1000),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: ethers.constants.AddressZero,
            to: user.address,
            value: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("partial", function () {
        beforeEach(async function () {
          await bonding.mintToE(user.address, 1000);
          await dollar.connect(user).approve(bonding.address, 1000);
          await bonding.connect(user).deposit(800);

          const tx = await bonding.connect(user).bond(500);
          txRecp = await tx.wait();
        });

        it("is fluid", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(200));
          expectBNEq(await bonding.balanceOf(user.address), BN(500).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(300));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(500));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(800));
          expectBNEq(await bonding.totalSupply(), BN(500).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.totalBonded(), BN(500));
          expectBNEq(await bonding.totalStaged(), BN(300));
        });

        it("emits Bond event", async function () {
          await expectEventIn(txRecp, "Bond", {
            account: user.address,
            start: BN(2),
            value: BN(500).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(500),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: ethers.constants.AddressZero,
            to: user.address,
            value: BN(500).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("multiple", function () {
        beforeEach(async function () {
          await bonding.mintToE(user1.address, 1000);
          await dollar.connect(user1).approve(bonding.address, 1000);
          await bonding.connect(user1).deposit(1000);

          await bonding.mintToE(user2.address, 1000);
          await dollar.connect(user2).approve(bonding.address, 1000);
          await bonding.connect(user2).deposit(1000);

          await bonding.connect(user1).bond(600);
          await bonding.connect(user2).bond(400);

          await bonding.connect(user).incrementEpochE();
          await bonding.mintToE(bonding.address, 1000);
          await bonding.incrementTotalBondedE(1000);

          await bonding.mintToE(user.address, 1000);
          await dollar.connect(user).approve(bonding.address, 800);
          await bonding.connect(user).deposit(800);

          const tx = await bonding.connect(user).connect(user).bond(500);
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(200));
          expectBNEq(await bonding.balanceOf(user.address), BN(250).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(300));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(500));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(3800));
          expectBNEq(await bonding.totalSupply(), BN(1250).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.totalBonded(), BN(2500));
          expectBNEq(await bonding.totalStaged(), BN(1300));
        });

        it("emits Bond event", async function () {
          await expectEventIn(txRecp, "Bond", {
            account: user.address,
            start: BN(3),
            value: BN(250).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(500),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: ethers.constants.AddressZero,
            to: user.address,
            value: BN(250).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });
    });

    describe("when unbond", function () {
      beforeEach(async function () {
        await bonding.mintToE(user.address, 1000);
        await dollar.connect(user).approve(bonding.address, 1000);
        await bonding.connect(user).deposit(1000);

        await bonding.connect(user).bond(1000);
        await bonding.connect(user).incrementEpochE();
      });

      describe("simple", function () {
        beforeEach(async function () {
          const tx = await bonding.connect(user).unbond(BN(1000).mul(INITIAL_STAKE_MULTIPLE));
          txRecp = await tx.wait();
        });

        it("is fluid", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(1000));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(0));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
          expectBNEq(await bonding.totalSupply(), BN(0));
          expectBNEq(await bonding.totalBonded(), BN(0));
          expectBNEq(await bonding.totalStaged(), BN(1000));
        });

        it("emits Unbond event", async function () {
          await expectEventIn(txRecp, "Unbond", {
            account: user.address,
            start: BN(3),
            value: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(1000),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: user.address,
            to: ethers.constants.AddressZero,
            value: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("partial", function () {
        beforeEach(async function () {
          const tx = await bonding.connect(user).unbond(BN(800).mul(INITIAL_STAKE_MULTIPLE));
          txRecp = await tx.wait();
        });

        it("is fluid", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(800));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(200));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
          expectBNEq(await bonding.totalSupply(), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.totalBonded(), BN(200));
          expectBNEq(await bonding.totalStaged(), BN(800));
        });

        it("emits Unbond event", async function () {
          await expectEventIn(txRecp, "Unbond", {
            account: user.address,
            start: BN(3),
            value: BN(800).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(800),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: user.address,
            to: ethers.constants.AddressZero,
            value: BN(800).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("multiple", function () {
        beforeEach(async function () {
          await bonding.mintToE(user1.address, 1000);
          await dollar.connect(user1).approve(bonding.address, 1000);
          await bonding.connect(user1).deposit(1000);

          await bonding.mintToE(user2.address, 1000);
          await dollar.connect(user2).approve(bonding.address, 1000);
          await bonding.connect(user2).deposit(1000);

          await bonding.connect(user1).bond(600);
          await bonding.connect(user2).bond(400);

          await bonding.connect(user).incrementEpochE();
          await bonding.mintToE(bonding.address, 1000);
          await bonding.incrementTotalBondedE(1000);

          const tx = await bonding.connect(user).unbond(BN(800).mul(INITIAL_STAKE_MULTIPLE));
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(1200));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(300));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(4000));
          expectBNEq(await bonding.totalSupply(), BN(1200).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.totalBonded(), BN(1800));
          expectBNEq(await bonding.totalStaged(), BN(2200));
        });

        it("emits Unbond event", async function () {
          await expectEventIn(txRecp, "Unbond", {
            account: user.address,
            start: BN(4),
            value: BN(800).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(1200),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: user.address,
            to: ethers.constants.AddressZero,
            value: BN(800).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });
    });

    describe("when unbondUnderlying", function () {
      beforeEach(async function () {
        await bonding.mintToE(user.address, 1000);
        await dollar.connect(user).approve(bonding.address, 1000);
        await bonding.connect(user).deposit(1000);

        await bonding.connect(user).bond(1000);
        await bonding.connect(user).incrementEpochE();
      });

      describe("simple", function () {
        beforeEach(async function () {
          const tx = await bonding.connect(user).unbondUnderlying(1000);
          txRecp = await tx.wait();
        });

        it("is fluid", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(1000));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(0));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
          expectBNEq(await bonding.totalSupply(), BN(0));
          expectBNEq(await bonding.totalBonded(), BN(0));
          expectBNEq(await bonding.totalStaged(), BN(1000));
        });

        it("emits Unbond event", async function () {
          await expectEventIn(txRecp, "Unbond", {
            account: user.address,
            start: BN(3),
            value: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(1000),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: user.address,
            to: ethers.constants.AddressZero,
            value: BN(1000).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("partial", function () {
        beforeEach(async function () {
          const tx = await bonding.connect(user).unbondUnderlying(800);
          txRecp = await tx.wait();
        });

        it("is fluid", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(800));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(200));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
          expectBNEq(await bonding.totalSupply(), BN(200).mul(INITIAL_STAKE_MULTIPLE));
          expectBNEq(await bonding.totalBonded(), BN(200));
          expectBNEq(await bonding.totalStaged(), BN(800));
        });

        it("emits Unbond event", async function () {
          await expectEventIn(txRecp, "Unbond", {
            account: user.address,
            start: BN(3),
            value: BN(800).mul(INITIAL_STAKE_MULTIPLE),
            valueUnderlying: BN(800),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: user.address,
            to: ethers.constants.AddressZero,
            value: BN(800).mul(INITIAL_STAKE_MULTIPLE),
          });
        });
      });

      describe("multiple", function () {
        beforeEach(async function () {
          await bonding.mintToE(user1.address, 1000);
          await dollar.connect(user1).approve(bonding.address, 1000);
          await bonding.connect(user1).deposit(1000);

          await bonding.mintToE(user2.address, 1000);
          await dollar.connect(user2).approve(bonding.address, 1000);
          await bonding.connect(user2).deposit(1000);

          await bonding.connect(user1).bond(600);
          await bonding.connect(user2).bond(400);

          await bonding.connect(user).incrementEpochE();
          await bonding.mintToE(bonding.address, 1000);
          await bonding.incrementTotalBondedE(1000);

          const tx = await bonding.connect(user).unbondUnderlying(800);
          txRecp = await tx.wait();
        });

        it("is frozen", async function () {
          expectBNEq(await bonding.statusOf(user.address), FLUID);
        });

        it("updates users balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(0));
          expectBNEq(await bonding.balanceOf(user.address), BN(466666667));
          expectBNEq(await bonding.balanceOfStaged(user.address), BN(800));
          expectBNEq(await bonding.balanceOfBonded(user.address), BN(700));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(bonding.address), BN(4000));
          expectBNEq(await bonding.totalSupply(), BN(1466666667));
          expectBNEq(await bonding.totalBonded(), BN(2200));
          expectBNEq(await bonding.totalStaged(), BN(1800));
        });

        it("emits Unbond event", async function () {
          await expectEventIn(txRecp, "Unbond", {
            account: user.address,
            start: BN(4),
            value: BN(533333333),
            valueUnderlying: BN(800),
          });
        });

        it("emits Transfer event", async function () {
          await expectEventIn(txRecp, "Transfer", {
            from: user.address,
            to: ethers.constants.AddressZero,
            value: BN(533333333),
          });
        });
      });
    });
  });

  describe("fluid", function () {
    beforeEach(async function () {
      await bonding.mintToE(user.address, 1000);
      await dollar.connect(user).approve(bonding.address, 1000);
      await bonding.connect(user).deposit(1000);

      await bonding.connect(user).connect(user).bond(500);
    });

    it("is fluid", async function () {
      expectBNEq(await bonding.statusOf(user.address), FLUID);
    });

    describe("when deposit", function () {
      it("reverts", async function () {
        await expectRevert(bonding.connect(user).deposit(1000), "Permission: Not frozen");
      });
    });

    describe("when withdraw", function () {
      it("reverts", async function () {
        await expectRevert(bonding.connect(user).withdraw(1000), "Permission: Not frozen");
      });
    });

    describe("when bond", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        const tx = await bonding.connect(user).bond(500);
        txRecp = await tx.wait();
      });

      it("is fluid", async function () {
        expectBNEq(await bonding.statusOf(user.address), FLUID);
      });

      it("updates users balances", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(0));
        expectBNEq(await bonding.balanceOf(user.address), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
        expectBNEq(await bonding.balanceOfStaged(user.address), BN(0));
        expectBNEq(await bonding.balanceOfBonded(user.address), BN(1000));
      });

      it("updates dao balances", async function () {
        expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
        expectBNEq(await bonding.totalSupply(), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
        expectBNEq(await bonding.totalBonded(), BN(1000));
        expectBNEq(await bonding.totalStaged(), BN(0));
      });

      it("emits Bond event", async function () {
        await expectEventIn(txRecp, "Bond", {
          account: user.address,
          start: BN(2),
          value: BN(500).mul(INITIAL_STAKE_MULTIPLE),
          valueUnderlying: BN(500),
        });
      });

      it("emits Transfer event", async function () {
        await expectEventIn(txRecp, "Transfer", {
          from: ethers.constants.AddressZero,
          to: user.address,
          value: BN(500).mul(INITIAL_STAKE_MULTIPLE),
        });
      });
    });

    describe("when unbond", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        const tx = await bonding.connect(user).unbond(BN(500).mul(INITIAL_STAKE_MULTIPLE));
        txRecp = await tx.wait();
      });

      it("is fluid", async function () {
        expectBNEq(await bonding.statusOf(user.address), FLUID);
      });

      it("updates users balances", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(0));
        expectBNEq(await bonding.balanceOf(user.address), BN(0));
        expectBNEq(await bonding.balanceOfStaged(user.address), BN(1000));
        expectBNEq(await bonding.balanceOfBonded(user.address), BN(0));
      });

      it("updates dao balances", async function () {
        expectBNEq(await dollar.balanceOf(bonding.address), BN(1000));
        expectBNEq(await bonding.totalSupply(), BN(0));
        expectBNEq(await bonding.totalBonded(), BN(0));
        expectBNEq(await bonding.totalStaged(), BN(1000));
      });

      it("emits Unbond event", async function () {
        await expectEventIn(txRecp, "Unbond", {
          account: user.address,
          start: BN(2),
          value: BN(500).mul(INITIAL_STAKE_MULTIPLE),
        });
      });

      it("emits Transfer event", async function () {
        await expectEventIn(txRecp, "Transfer", {
          from: user.address,
          to: ethers.constants.AddressZero,
          value: BN(500).mul(INITIAL_STAKE_MULTIPLE),
        });
      });
    });
  });

  describe("locked", function () {
    beforeEach(async function () {
      await bonding.mintToE(user.address, 1000);
      await dollar.connect(user).approve(bonding.address, 1000);

      await bonding.createCandidateE(owner.address, 7);
      await bonding.placeLockE(user.address, owner.address);
    });

    it("is locked", async function () {
      expectBNEq(await bonding.statusOf(user.address), LOCKED);
    });

    describe("when deposit", function () {
      it("doesnt revert", async function () {
        const tx = await bonding.connect(user).deposit(1000);
        const txRecp = await tx.wait();
        expect(txRecp).to.not.be.empty;
      });
    });

    describe("when withdraw", function () {
      it("doesnt revert", async function () {
        await bonding.connect(user).deposit(1000);
        const tx = await bonding.connect(user).withdraw(1000);
        const txRecp = await tx.wait();

        expect(txRecp).to.be.not.empty;
      });
    });

    describe("when bond", function () {
      it("reverts", async function () {
        await expectRevert(bonding.connect(user).bond(1000), "Permission: Not frozen");
      });
    });

    describe("when unbond", function () {
      it("reverts", async function () {
        await expectRevert(bonding.connect(user).unbond(1000), "Permission: Not frozen");
      });
    });
  });

  describe("when step", function () {
    beforeEach(async function () {
      /* Deposit and Bond User */
      await bonding.mintToE(user.address, 1000);
      await dollar.connect(user).approve(bonding.address, 1000);
      await bonding.connect(user).deposit(1000);
      await bonding.connect(user).bond(1000);

      await increaseTime(86400);
      await bonding.connect(user).stepE();

      /* Payout to Bonded */
      await bonding.mintToE(bonding.address, 1000);
      await bonding.incrementTotalBondedE(1000);

      /* Deposit and Bond User 1+2 */
      await bonding.mintToE(user1.address, 1000);
      await dollar.connect(user1).approve(bonding.address, 1000);
      await bonding.connect(user1).deposit(1000);

      await bonding.mintToE(user2.address, 1000);
      await dollar.connect(user2).approve(bonding.address, 1000);
      await bonding.connect(user2).deposit(1000);

      await bonding.connect(user1).bond(1000);
      await bonding.connect(user2).bond(1000);

      await increaseTime(86400);
      await bonding.connect(user).stepE();

      /* Unbond User */
      await bonding.connect(user).unbondUnderlying(2000);

      await increaseTime(86400);
      for (let i = 0; i < 14; i++) {
        await bonding.connect(user).stepE();
      }
    });

    describe("preceeding epoch cooldown", function () {
      it("user is fluid", async function () {
        expectBNEq(await bonding.statusOf(user.address), FLUID);
      });

      it("is correct epoch", async function () {
        expectBNEq(await bonding.epoch(), BN(17));
      });
    });

    describe("after epoch lock cooldown", function () {
      beforeEach(async function () {
        await bonding.connect(user).stepE();
      });

      it("user is frozen", async function () {
        expectBNEq(await bonding.statusOf(user.address), FROZEN);
      });

      it("is correct epoch", async function () {
        expectBNEq(await bonding.epoch(), BN(18));
      });

      it("has correct snapshots", async function () {
        expectBNEq(await bonding.totalBondedAt(0), BN(0));
        expectBNEq(await bonding.totalBondedAt(1), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
        expectBNEq(await bonding.totalBondedAt(2), BN(2000).mul(INITIAL_STAKE_MULTIPLE));
        expectBNEq(await bonding.totalBondedAt(3), BN(1000).mul(INITIAL_STAKE_MULTIPLE));
      });
    });
  });
});
