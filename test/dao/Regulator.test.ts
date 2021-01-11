import { ethers } from "hardhat";
import { expectBNEq, expectEventIn, BN } from "../Utils";

import { POOL_REWARD_PERCENT, TREASURY_ADDRESS, TREASURY_REWARD_BIPS } from "../Constants";
import { Contract, ContractFactory, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

function lessPoolAndTreasuryIncentive(baseAmount, newAmount) {
  return BN(baseAmount + newAmount)
    .sub(poolIncentive(newAmount))
    .sub(treasuryIncentive(newAmount));
}

function poolIncentive(newAmount) {
  return BN(newAmount).mul(POOL_REWARD_PERCENT).div(BN(100));
}

function treasuryIncentive(newAmount) {
  return BN(newAmount).mul(TREASURY_REWARD_BIPS).div(BN(10000));
}

describe("Regulator", function () {
  let [owner, user, pool]: SignerWithAddress[] = [];

  let MockSettableOracle: ContractFactory;
  let MockRegulator: ContractFactory;

  let oracle: Contract;
  let regulator: Contract;
  let dollar: Contract;

  before(async function () {
    [owner, user, pool] = await ethers.getSigners();

    MockSettableOracle = await ethers.getContractFactory("MockSettableOracle");
    MockRegulator = await ethers.getContractFactory("MockRegulator");
  });

  beforeEach(async function () {
    oracle = await MockSettableOracle.connect(owner).deploy({ gasLimit: 8000000 });
    regulator = await MockRegulator.connect(owner).deploy(oracle.address, pool.address, { gasLimit: 8000000 });
    dollar = await ethers.getContractAt("Dollar", await regulator.dollar());
  });

  describe("after bootstrapped", function () {
    beforeEach(async function () {
      await regulator.incrementEpochE(); // 1
      await regulator.incrementEpochE(); // 2
      await regulator.incrementEpochE(); // 3
      await regulator.incrementEpochE(); // 4
      await regulator.incrementEpochE(); // 5
    });

    describe("up regulation", function () {
      describe("above limit", function () {
        let expectedReward: number;

        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1
          await regulator.incrementEpochE(); // 2
          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);
        });

        describe("on step", function () {
          let txRecp: ContractReceipt;
          beforeEach(async function () {
            await oracle.set(115, 100, true);
            expectedReward = 30000;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("mints new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000).add(BN(expectedReward)));
            expectBNEq(
              await dollar.balanceOf(regulator.address),
              lessPoolAndTreasuryIncentive(1000000, expectedReward),
            );
            expectBNEq(await dollar.balanceOf(pool.address), poolIncentive(expectedReward));
            expectBNEq(await dollar.balanceOf(TREASURY_ADDRESS), treasuryIncentive(expectedReward));
          });

          it("updates totals", async function () {
            expectBNEq(await regulator.totalStaged(), BN(0));
            expectBNEq(await regulator.totalBonded(), lessPoolAndTreasuryIncentive(1000000, expectedReward));
            expectBNEq(await regulator.totalDebt(), BN(0));
            expectBNEq(await regulator.totalSupply(), BN(0));
            expectBNEq(await regulator.totalCoupons(), BN(0));
            expectBNEq(await regulator.totalRedeemable(), BN(0));
          });

          it("emits SupplyIncrease event", async function () {
            await expectEventIn(txRecp, "SupplyIncrease", {
              epoch: BN(7),
              price: BN(115).mul(BN(10).pow(BN(16))),
              newRedeemable: BN(0),
              lessDebt: BN(0),
              newBonded: BN(expectedReward),
            });
          });
        });
      });

      describe("(2) - only to bonded", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1
          await regulator.incrementEpochE(); // 2
          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);
        });

        describe("on step", function () {
          let expectedReward: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(101, 100, true);
            expectedReward = 10000;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("mints new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000).add(BN(expectedReward)));
            expectBNEq(
              await dollar.balanceOf(regulator.address),
              lessPoolAndTreasuryIncentive(1000000, expectedReward),
            );
            expectBNEq(await dollar.balanceOf(pool.address), poolIncentive(expectedReward));
            expectBNEq(await dollar.balanceOf(TREASURY_ADDRESS), treasuryIncentive(expectedReward));
          });

          it("updates totals", async function () {
            expectBNEq(await regulator.totalStaged(), BN(0));
            expectBNEq(await regulator.totalBonded(), lessPoolAndTreasuryIncentive(1000000, expectedReward));
            expectBNEq(await regulator.totalDebt(), BN(0));
            expectBNEq(await regulator.totalSupply(), BN(0));
            expectBNEq(await regulator.totalCoupons(), BN(0));
            expectBNEq(await regulator.totalRedeemable(), BN(0));
          });

          it("emits SupplyIncrease event", async function () {
            await expectEventIn(txRecp, "SupplyIncrease", {
              epoch: BN(7),
              price: BN(101).mul(BN(10).pow(BN(16))),
              newRedeemable: BN(0),
              lessDebt: BN(0),
              newBonded: BN(expectedReward),
            });
          });
        });
      });

      describe("(1) - refresh redeemable at specified ratio", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.increaseDebtE(BN(2000));
          await regulator.incrementBalanceOfCouponsE(user.address, 1, BN(100000));

          await regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          let [
            expectedReward,
            expectedRewardCoupons,
            expectedRewardDAO,
            expectedRewardLP,
            expectedRewardTreasury,
          ]: number[] = [];
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(101, 100, true);
            expectedReward = 10000;
            expectedRewardCoupons = 7750;
            expectedRewardDAO = 0;
            expectedRewardLP = 2000;
            expectedRewardTreasury = 250;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("mints new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000).add(BN(expectedReward)));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000).add(BN(expectedRewardCoupons)));
            expectBNEq(await dollar.balanceOf(pool.address), BN(expectedRewardLP));
            expectBNEq(await dollar.balanceOf(TREASURY_ADDRESS), BN(expectedRewardTreasury));
          });

          it("updates totals", async function () {
            expectBNEq(await regulator.totalStaged(), BN(0));
            expectBNEq(await regulator.totalBonded(), BN(1000000).add(BN(expectedRewardDAO)));
            expectBNEq(await regulator.totalDebt(), BN(0));
            expectBNEq(await regulator.totalSupply(), BN(0));
            expectBNEq(await regulator.totalCoupons(), BN(100000));
            expectBNEq(await regulator.totalRedeemable(), BN(expectedRewardCoupons));
          });

          it("emits SupplyIncrease event", async function () {
            await expectEventIn(txRecp, "SupplyIncrease", {
              epoch: BN(7),
              price: BN(101).mul(BN(10).pow(BN(16))),
              newRedeemable: BN(expectedRewardCoupons),
              lessDebt: BN(2000),
              newBonded: BN(expectedRewardLP + expectedRewardDAO + expectedRewardTreasury),
            });
          });
        });
      });
    });

    describe("(1 + 2) - refresh redeemable then mint to bonded", function () {
      beforeEach(async function () {
        await regulator.incrementEpochE(); // 1

        await regulator.incrementTotalBondedE(1000000);
        await regulator.mintToE(regulator.address, 1000000);

        await regulator.increaseDebtE(BN(2000));
        await regulator.incrementBalanceOfCouponsE(user.address, 1, BN(2000));

        await regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        let txRecp: ContractReceipt;
        let [bondedReward, newRedeemable, poolReward, treasuryReward]: number[] = [];

        beforeEach(async function () {
          await oracle.set(101, 100, true);
          bondedReward = 5750;
          newRedeemable = 2000;
          poolReward = 2000;
          treasuryReward = 250;

          const tx = await regulator.stepE();
          txRecp = await tx.wait();
        });

        it("mints new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(1010000));
          expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000 + newRedeemable + bondedReward));
          expectBNEq(await dollar.balanceOf(pool.address), BN(poolReward));
          expectBNEq(await dollar.balanceOf(TREASURY_ADDRESS), BN(treasuryReward));
        });

        it("updates totals", async function () {
          expectBNEq(await regulator.totalStaged(), BN(0));
          expectBNEq(await regulator.totalBonded(), BN(1000000 + bondedReward));
          expectBNEq(await regulator.totalDebt(), BN(0));
          expectBNEq(await regulator.totalSupply(), BN(0));
          expectBNEq(await regulator.totalCoupons(), BN(2000));
          expectBNEq(await regulator.totalRedeemable(), BN(2000));
        });

        it("emits SupplyIncrease event", async function () {
          await expectEventIn(txRecp, "SupplyIncrease", {
            epoch: BN(7),
            price: BN(101).mul(BN(10).pow(BN(16))),
            newRedeemable: BN(2000),
            lessDebt: BN(2000),
            newBonded: BN(8000),
          });
        });
      });
    });

    describe("(3) - above limit but below coupon limit", function () {
      beforeEach(async function () {
        await regulator.incrementEpochE(); // 1

        await regulator.incrementTotalBondedE(1000000);
        await regulator.mintToE(regulator.address, 1000000);

        await regulator.increaseDebtE(BN(2000));
        await regulator.incrementBalanceOfCouponsE(user.address, 1, BN(100000));

        await regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        let [
          expectedReward,
          expectedRewardCoupons,
          expectedRewardDAO,
          expectedRewardLP,
          expectedRewardTreasury,
        ]: number[] = [];
        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await oracle.set(105, 100, true);
          expectedReward = 50000;
          expectedRewardCoupons = 38750;
          expectedRewardDAO = 0;
          expectedRewardLP = 10000;
          expectedRewardTreasury = 1250;

          const tx = await regulator.stepE();
          txRecp = await tx.wait();
        });

        it("mints new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(1000000).add(BN(expectedReward)));
          expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000).add(BN(expectedRewardCoupons)));
          expectBNEq(await dollar.balanceOf(pool.address), BN(expectedRewardLP));
          expectBNEq(await dollar.balanceOf(TREASURY_ADDRESS), BN(expectedRewardTreasury));
        });

        it("updates totals", async function () {
          expectBNEq(await regulator.totalStaged(), BN(0));
          expectBNEq(await regulator.totalBonded(), BN(1000000).add(BN(expectedRewardDAO)));
          expectBNEq(await regulator.totalDebt(), BN(0));
          expectBNEq(await regulator.totalSupply(), BN(0));
          expectBNEq(await regulator.totalCoupons(), BN(100000));
          expectBNEq(await regulator.totalRedeemable(), BN(expectedRewardCoupons));
        });

        it("emits SupplyIncrease event", async function () {
          await expectEventIn(txRecp, "SupplyIncrease", {
            epoch: BN(7),
            price: BN(105).mul(BN(10).pow(BN(16))),
            newRedeemable: BN(expectedRewardCoupons),
            lessDebt: BN(2000),
            newBonded: BN(expectedRewardLP + expectedRewardDAO + expectedRewardTreasury),
          });
        });
      });
    });

    describe("down regulation", function () {
      describe("under limit", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1
          await regulator.incrementEpochE(); // 2

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.incrementEpochE(); // 3
        });

        describe("on step", function () {
          let expectedDebt: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(85, 100, true);
            expectedDebt = 30000;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("doesnt mint new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
            expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          });

          it("updates totals", async function () {
            expectBNEq(await regulator.totalStaged(), BN(0));
            expectBNEq(await regulator.totalBonded(), BN(1000000));
            expectBNEq(await regulator.totalDebt(), BN(expectedDebt));
            expectBNEq(await regulator.totalSupply(), BN(0));
            expectBNEq(await regulator.totalCoupons(), BN(0));
            expectBNEq(await regulator.totalRedeemable(), BN(0));
          });

          it("emits SupplyDecrease event", async function () {
            await expectEventIn(txRecp, "SupplyDecrease", {
              epoch: BN(8),
              price: BN(85).mul(BN(10).pow(BN(16))),
              newDebt: BN(expectedDebt),
            });
          });
        });
      });

      describe("without debt", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          let expectedDebt: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(99, 100, true);
            expectedDebt = 10000;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("doesnt mint new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
            expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          });

          it("updates totals", async function () {
            expectBNEq(await regulator.totalStaged(), BN(0));
            expectBNEq(await regulator.totalBonded(), BN(1000000));
            expectBNEq(await regulator.totalDebt(), BN(expectedDebt));
            expectBNEq(await regulator.totalSupply(), BN(0));
            expectBNEq(await regulator.totalCoupons(), BN(0));
            expectBNEq(await regulator.totalRedeemable(), BN(0));
          });

          it("emits SupplyDecrease event", async function () {
            await expectEventIn(txRecp, "SupplyDecrease", {
              epoch: BN(7),
              price: BN(99).mul(BN(10).pow(BN(16))),
              newDebt: BN(expectedDebt),
            });
          });
        });
      });

      describe("with debt", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.increaseDebtE(BN(100000));

          await regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          let expectedDebt: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(99, 100, true);
            expectedDebt = 9000;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("doesnt mint new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
            expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          });

          it("updates totals", async function () {
            it("updates totals", async function () {
              expectBNEq(await regulator.totalStaged(), BN(0));
              expectBNEq(await regulator.totalBonded(), BN(1000000));
              expectBNEq(await regulator.totalDebt(), BN(100000).add(BN(expectedDebt)));
              expectBNEq(await regulator.totalSupply(), BN(0));
              expectBNEq(await regulator.totalCoupons(), BN(0));
              expectBNEq(await regulator.totalRedeemable(), BN(0));
            });
          });

          it("emits SupplyDecrease event", async function () {
            await expectEventIn(txRecp, "SupplyDecrease", {
              epoch: BN(7),
              price: BN(99).mul(BN(10).pow(BN(16))),
              newDebt: BN(expectedDebt),
            });
          });
        });
      });

      describe("with debt over limit", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.increaseDebtE(BN(100000));

          await regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          let expectedDebt: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(95, 100, true);
            expectedDebt = 27000; // 3% not 5%

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("doesnt mint new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
            expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          });

          it("updates totals", async function () {
            it("updates totals", async function () {
              expectBNEq(await regulator.totalStaged(), BN(0));
              expectBNEq(await regulator.totalBonded(), BN(1000000));
              expectBNEq(await regulator.totalDebt(), BN(100000).add(BN(expectedDebt)));
              expectBNEq(await regulator.totalSupply(), BN(0));
              expectBNEq(await regulator.totalCoupons(), BN(0));
              expectBNEq(await regulator.totalRedeemable(), BN(0));
            });
          });

          it("emits SupplyDecrease event", async function () {
            await expectEventIn(txRecp, "SupplyDecrease", {
              epoch: BN(7),
              price: BN(95).mul(BN(10).pow(BN(16))),
              newDebt: BN(expectedDebt),
            });
          });
        });
      });

      describe("with debt some capped", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.increaseDebtE(BN(145000));

          await regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          let expectedDebt: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(99, 100, true);
            expectedDebt = 5000;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("doesnt mint new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
            expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          });

          it("updates totals", async function () {
            it("updates totals", async function () {
              expectBNEq(await regulator.totalStaged(), BN(0));
              expectBNEq(await regulator.totalBonded(), BN(1000000));
              expectBNEq(await regulator.totalDebt(), BN(145000).add(BN(expectedDebt)));
              expectBNEq(await regulator.totalSupply(), BN(0));
              expectBNEq(await regulator.totalCoupons(), BN(0));
              expectBNEq(await regulator.totalRedeemable(), BN(0));
            });
          });

          it("emits SupplyDecrease event", async function () {
            await expectEventIn(txRecp, "SupplyDecrease", {
              epoch: BN(7),
              price: BN(99).mul(BN(10).pow(BN(16))),
              newDebt: BN(expectedDebt),
            });
          });
        });
      });

      describe("with debt all capped", function () {
        beforeEach(async function () {
          await regulator.incrementEpochE(); // 1

          await regulator.incrementTotalBondedE(1000000);
          await regulator.mintToE(regulator.address, 1000000);

          await regulator.increaseDebtE(BN(350000));

          await regulator.incrementEpochE(); // 2
        });

        describe("on step", function () {
          let expectedDebt: number;
          let txRecp: ContractReceipt;

          beforeEach(async function () {
            await oracle.set(99, 100, true);
            expectedDebt = 0;

            const tx = await regulator.stepE();
            txRecp = await tx.wait();
          });

          it("doesnt mint new Dollar tokens", async function () {
            expectBNEq(await dollar.totalSupply(), BN(1000000));
            expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
            expectBNEq(await dollar.balanceOf(pool.address), BN(0));
          });

          it("updates totals", async function () {
            it("updates totals", async function () {
              expectBNEq(await regulator.totalStaged(), BN(0));
              expectBNEq(await regulator.totalBonded(), BN(1000000));
              expectBNEq(await regulator.totalDebt(), BN(350000).add(BN(expectedDebt)));
              expectBNEq(await regulator.totalSupply(), BN(0));
              expectBNEq(await regulator.totalCoupons(), BN(0));
              expectBNEq(await regulator.totalRedeemable(), BN(0));
            });
          });

          it("emits SupplyDecrease event", async function () {
            await expectEventIn(txRecp, "SupplyDecrease", {
              epoch: BN(7),
              price: BN(99).mul(BN(10).pow(BN(16))),
              newDebt: BN(expectedDebt),
            });
          });
        });
      });
    });

    describe("neutral regulation", function () {
      beforeEach(async function () {
        await regulator.incrementEpochE(); // 1

        await regulator.incrementTotalBondedE(1000000);
        await regulator.mintToE(regulator.address, 1000000);

        await regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        let txRecp: ContractReceipt;
        beforeEach(async function () {
          await oracle.set(100, 100, true);
          const tx = await regulator.stepE();
          txRecp = await tx.wait();
        });

        it("doesnt mint new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(1000000));
          expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
          expectBNEq(await dollar.balanceOf(pool.address), BN(0));
        });

        it("updates totals", async function () {
          expectBNEq(await regulator.totalStaged(), BN(0));
          expectBNEq(await regulator.totalBonded(), BN(1000000));
          expectBNEq(await regulator.totalDebt(), BN(0));
          expectBNEq(await regulator.totalSupply(), BN(0));
          expectBNEq(await regulator.totalCoupons(), BN(0));
          expectBNEq(await regulator.totalRedeemable(), BN(0));
        });

        it("emits SupplyNeutral event", async function () {
          await expectEventIn(txRecp, "SupplyNeutral", { epoch: BN(7) });
        });
      });
    });

    describe("not valid", function () {
      beforeEach(async function () {
        await regulator.incrementEpochE(); // 1

        await regulator.incrementTotalBondedE(1000000);
        await regulator.mintToE(regulator.address, 1000000);

        await regulator.incrementEpochE(); // 2
      });

      describe("on step", function () {
        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await oracle.set(105, 100, false);
          const tx = await regulator.stepE();
          txRecp = await tx.wait();
        });

        it("doesnt mint new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(1000000));
          expectBNEq(await dollar.balanceOf(regulator.address), BN(1000000));
          expectBNEq(await dollar.balanceOf(pool.address), BN(0));
        });

        it("updates totals", async function () {
          expectBNEq(await regulator.totalStaged(), BN(0));
          expectBNEq(await regulator.totalBonded(), BN(1000000));
          expectBNEq(await regulator.totalDebt(), BN(0));
          expectBNEq(await regulator.totalSupply(), BN(0));
          expectBNEq(await regulator.totalCoupons(), BN(0));
          expectBNEq(await regulator.totalRedeemable(), BN(0));
        });

        it("emits SupplyNeutral event", async function () {
          await expectEventIn(txRecp, "SupplyNeutral", { epoch: BN(7) });
        });
      });
    });
  });
});
