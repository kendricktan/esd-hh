import { ethers } from "hardhat";
import { expectBNEq, expectEventIn, expectRevert, BN } from "../Utils";

import { Contract, ContractFactory, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

const DEBT_CAP = 0.15;

function premium(supply, debt, amount) {
  const start = debt / supply;
  const end = (debt - amount) / (supply - amount);

  if (start <= DEBT_CAP) {
    return Math.floor(premiumMean(start, end) * amount);
  }

  if (end >= DEBT_CAP) {
    return premiumSpot(DEBT_CAP);
  }

  const pCurve = Math.floor(premiumMean(start, DEBT_CAP)) * (start - DEBT_CAP);
  const pFlat = premiumSpot(DEBT_CAP) * (DEBT_CAP - end);
  return Math.floor(((pCurve + pFlat) / (start - end)) * amount);
}

function premiumSpot(ratio) {
  return 1.0 / ((1.0 - ratio) ^ 2) - 1.0;
}

function premiumMean(start, end) {
  return 1.0 / ((1.0 - start) * (1.0 - end)) - 1.0;
}

describe("Market", function () {
  let [owner, user, pool]: SignerWithAddress[] = [];
  let MockMarket: ContractFactory;

  let market: Contract;
  let dollar: Contract;

  before(async function () {
    [owner, user, pool] = await ethers.getSigners();

    MockMarket = await ethers.getContractFactory("MockMarket");
  });

  beforeEach(async function () {
    market = await MockMarket.connect(owner).deploy(pool.address, { gasLimit: 8000000 });
    dollar = await ethers.getContractAt("Dollar", await market.dollar());

    await market.incrementEpochE();
    await market.stepE();
    await market.mintToE(user.address, 1000000);
    await dollar.connect(user).approve(market.address, 1000000);
  });

  describe("purchaseCoupons", function () {
    describe("before call", function () {
      beforeEach(async function () {
        await market.incrementTotalDebtE(100000);
      });

      it("shows correct potential coupon premium", async function () {
        expectBNEq(await market.couponPremium(100000), BN(premium(1000000, 100000, 100000)));
      });
    });

    describe("no amount", function () {
      it("reverts", async function () {
        await expectRevert(market.connect(user).purchaseCoupons(0), "Market: Must purchase non-zero amount");
      });
    });

    describe("no debt", function () {
      it("total net is correct", async function () {
        expectBNEq(await market.totalNet(), BN(1000000));
      });

      it("reverts", async function () {
        await expectRevert(market.purchaseCoupons(100000), "Market: Not enough debt");
      });
    });

    describe("on single call", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await market.incrementTotalDebtE(100000);
        const tx = await market.connect(user).purchaseCoupons(100000);
        txRecp = await tx.wait();
      });

      it("updates user balances", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(900000));
        expectBNEq(await market.balanceOfCoupons(user.address, 1), BN(100000 + premium(1000000, 100000, 100000)));
      });

      it("shows correct preimum", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(900000));
        expectBNEq(await market.balanceOfCoupons(user.address, 1), BN(100000 + premium(1000000, 100000, 100000)));
      });

      it("updates dao balances", async function () {
        expectBNEq(await dollar.balanceOf(market.address), BN(0));
        expectBNEq(await market.totalCoupons(), BN(100000 + premium(1000000, 100000, 100000)));
        expectBNEq(await market.totalDebt(), BN(0));
        expectBNEq(await market.totalRedeemable(), BN(0));
      });

      it("emits CouponPurchase event", async function () {
        await expectEventIn(txRecp, "CouponPurchase", {
          account: user.address,
          epoch: BN(1),
          dollarAmount: BN(100000),
          couponAmount: BN(100000 + premium(1000000, 100000, 100000)),
        });
      });
    });

    describe("multiple calls", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await market.incrementTotalDebtE(100000);
        await market.connect(user).purchaseCoupons(50000);
        const tx = await market.connect(user).purchaseCoupons(50000);
        txRecp = await tx.wait();
      });

      it("updates user balances", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(900000));
        expectBNEq(
          await market.balanceOfCoupons(user.address, 1),
          BN(100000 + premium(1000000, 100000, 50000) + premium(950000, 50000, 50000)),
        );
      });

      it("updates dao balances", async function () {
        expectBNEq(await dollar.balanceOf(market.address), BN(0));
        expectBNEq(
          await market.totalCoupons(),
          BN(100000 + premium(1000000, 100000, 50000) + premium(950000, 50000, 50000)),
        );
        expectBNEq(await market.totalDebt(), BN(0));
        expectBNEq(await market.totalRedeemable(), BN(0));
      });

      it("emits CouponPurchase event", async function () {
        await expectEventIn(txRecp, "CouponPurchase", {
          account: user.address,
          epoch: BN(1),
          dollarAmount: BN(50000),
          couponAmount: BN(50000 + premium(950000, 50000, 50000)),
        });
      });
    });
  });

  describe("redeemCoupons", function () {
    beforeEach(async function () {
      await market.incrementTotalDebtE(100000);
      await market.connect(user).purchaseCoupons(100000);
      await market.mintToE(market.address, 100000);
      await market.incrementTotalRedeemableE(100000);
    });

    describe("before redeemable", function () {
      describe("same epoch", function () {
        it("reverts", async function () {
          await expectRevert(market.connect(user).redeemCoupons(1, 100000), "Market: Too early to redeem");
        });
      });

      describe("next epoch", function () {
        it("reverts", async function () {
          await market.incrementEpochE();
          await expectRevert(market.connect(user).redeemCoupons(1, 100000), "Market: Too early to redeem");
        });
      });
    });

    describe("after redeemable", function () {
      beforeEach(async function () {
        await market.incrementEpochE();
        await market.incrementEpochE();
      });

      describe("not enough coupon balance", function () {
        it("reverts", async function () {
          await expectRevert(market.connect(user).redeemCoupons(1, 200000), "Market: Insufficient coupon balance");
        });
      });

      describe("on single call", function () {
        let txRecp: ContractReceipt;

        beforeEach(async function () {
          const tx = await market.connect(user).redeemCoupons(1, 100000);
          txRecp = await tx.wait();
        });

        it("updates user balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(1000000));
          expectBNEq(await market.balanceOfCoupons(user.address, 1), BN(premium(1000000, 100000, 100000)));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(market.address), BN(0));
          expectBNEq(await market.totalCoupons(), BN(premium(1000000, 100000, 100000)));
          expectBNEq(await market.totalDebt(), BN(0));
          expectBNEq(await market.totalRedeemable(), BN(0));
        });

        it("emits CouponRedemption event", async function () {
          await expectEventIn(txRecp, "CouponRedemption", {
            account: user.address,
            epoch: BN(1),
            couponAmount: BN(100000),
          });
        });
      });

      describe("multiple calls", function () {
        let txRecp: ContractReceipt;

        beforeEach(async function () {
          let tx = await market.connect(user).redeemCoupons(1, 30000);
          await tx.wait();
          tx = await market.connect(user).redeemCoupons(1, 50000);
          txRecp = await tx.wait();
        });

        it("updates user balances", async function () {
          expectBNEq(await dollar.balanceOf(user.address), BN(980000));
          expectBNEq(await market.balanceOfCoupons(user.address, 1), BN(20000 + premium(1000000, 100000, 100000)));
        });

        it("updates dao balances", async function () {
          expectBNEq(await dollar.balanceOf(market.address), BN(20000));
          expectBNEq(await market.totalCoupons(), BN(20000 + premium(1000000, 100000, 100000)));
          expectBNEq(await market.totalDebt(), BN(0));
          expectBNEq(await market.totalRedeemable(), BN(20000));
        });

        it("emits CouponRedemption event", async function () {
          await expectEventIn(txRecp, "CouponRedemption", {
            account: user.address,
            epoch: BN(1),
            couponAmount: BN(50000),
          });
        });
      });
    });

    describe("after expired", function () {
      this.timeout(30000);

      beforeEach(async function () {
        for (let i = 0; i < 90; i++) {
          await market.incrementEpochE();
        }
        await market.stepE();
      });

      it("reverts", async function () {
        await expectRevert(market.connect(user).redeemCoupons(1, 100000), "Market: Insufficient coupon balance");
      });
    });
  });

  describe("approveCoupons", function () {
    describe("zero address", function () {
      it("reverts", async function () {
        await expectRevert(
          market.connect(user).approveCoupons(ethers.constants.AddressZero, 1000),
          "Market: Coupon approve to the zero address",
        );
      });
    });

    describe("on single call", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        const tx = await market.connect(user).approveCoupons(owner.address, 100000);
        txRecp = await tx.wait();
      });

      it("updates user approval", async function () {
        expectBNEq(await market.allowanceCoupons(user.address, owner.address), BN(100000));
      });

      it("emits CouponApproval event", async function () {
        await expectEventIn(txRecp, "CouponApproval", {
          owner: user.address,
          spender: owner.address,
          value: BN(100000),
        });
      });
    });

    describe("multiple calls", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await market.connect(user).approveCoupons(owner.address, 100000);
        const tx = await market.connect(user).approveCoupons(owner.address, 0);
        txRecp = await tx.wait();
      });

      it("updates user approval", async function () {
        expectBNEq(await market.allowanceCoupons(user.address, owner.address), BN(0));
      });

      it("emits CouponApproval event", async function () {
        await expectEventIn(txRecp, "CouponApproval", {
          owner: user.address,
          spender: owner.address,
          value: BN(0),
        });
      });
    });
  });

  describe("transferCoupons", function () {
    beforeEach(async function () {
      await market.incrementTotalDebtE(100000);
      await market.connect(user).purchaseCoupons(100000);
    });

    describe("sender zero address", function () {
      it("reverts", async function () {
        await expectRevert(
          market.connect(user).transferCoupons(ethers.constants.AddressZero, user.address, 1, 100000),
          "Market: Coupon transfer from the zero address",
        );
      });
    });

    describe("recipient zero address", function () {
      it("reverts", async function () {
        await expectRevert(
          market.connect(user).transferCoupons(user.address, ethers.constants.AddressZero, 1, 100000),
          "Market: Coupon transfer to the zero address",
        );
      });
    });

    describe("on call from self", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        const tx = await market.connect(user).transferCoupons(user.address, owner.address, 1, 100000);
        txRecp = await tx.wait();
      });

      it("updates balances", async function () {
        expectBNEq(await market.balanceOfCoupons(user.address, 1), BN(premium(1000000, 100000, 100000)));
        expectBNEq(await market.balanceOfCoupons(owner.address, 1), BN(100000));
      });

      it("emits CouponTransfer event", async function () {
        await expectEventIn(txRecp, "CouponTransfer", {
          from: user.address,
          to: owner.address,
          epoch: BN(1),
          value: BN(100000),
        });
      });
    });

    describe("on call from self too much", function () {
      it("reverts", async function () {
        await expectRevert(
          market.connect(owner).transferCoupons(user.address, owner.address, 1, 200000),
          "Market: Insufficient coupon balance",
        );
      });
    });

    describe("on unapproved call from other", function () {
      it("reverts", async function () {
        await expectRevert(
          market.connect(owner).transferCoupons(user.address, owner.address, 1, 100000),
          "Market: Insufficient coupon approval",
        );
      });
    });

    describe("on approved call from other", function () {
      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await market.connect(user).approveCoupons(owner.address, 100000);
        const tx = await market.connect(owner).transferCoupons(user.address, owner.address, 1, 100000);
        txRecp = await tx.wait();
      });

      it("updates balances", async function () {
        expectBNEq(await market.balanceOfCoupons(user.address, 1), BN(premium(1000000, 100000, 100000)));
        expectBNEq(await market.balanceOfCoupons(owner.address, 1), BN(100000));
      });

      it("updates approval", async function () {
        expectBNEq(await market.allowanceCoupons(user.address, owner.address), BN(0));
      });

      it("emits CouponTransfer event", async function () {
        await expectEventIn(txRecp, "CouponTransfer", {
          from: user.address,
          to: owner.address,
          epoch: BN(1),
          value: BN(100000),
        });
      });
    });

    describe("infinite approval", function () {
      beforeEach(async function () {
        await market.connect(user).approveCoupons(owner.address, ethers.constants.MaxUint256);
        await market.connect(owner).transferCoupons(user.address, owner.address, 1, 100000);
      });

      it("doesnt update approval", async function () {
        expectBNEq(await market.allowanceCoupons(user.address, owner.address), ethers.constants.MaxUint256);
      });
    });
  });

  describe("step", function () {
    beforeEach(async function () {
      await market.incrementEpochE();
      await market.stepE();
    });

    describe("on call without expiration", function () {
      it("initializes coupon expiry", async function () {
        expectBNEq(await market.couponsExpiration(2), BN(92));
        expectBNEq(await market.expiringCoupons(92), BN(1));
        expectBNEq(await market.expiringCouponsAtIndex(92, 0), BN(2));
      });
    });

    describe("on call with expiration", function () {
      this.timeout(30000);

      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await market.incrementTotalDebtE(100000);
        await market.connect(user).purchaseCoupons(100000);

        await market.incrementEpochE();
        await market.stepE();

        for (let i = 0; i < 89; i++) {
          await market.incrementEpochE();
        }
        const tx = await market.stepE();
        txRecp = await tx.wait();
      });

      it("emits CouponExpiration event", async function () {
        await expectEventIn(txRecp, "CouponExpiration", {
          epoch: BN(2),
          couponsExpired: BN(100000 + premium(1000000, 100000, 100000)),
          lessDebt: BN(0),
          newBonded: BN(0),
        });
      });
    });

    describe("on call with all reclaimed no bonded", function () {
      this.timeout(30000);

      let txRecp: ContractReceipt;

      beforeEach(async function () {
        await market.incrementTotalDebtE(100000);
        await market.connect(user).purchaseCoupons(100000);

        await market.mintToE(market.address, 100000);
        await market.incrementTotalRedeemableE(100000);

        await market.incrementEpochE();
        let tx = await market.stepE();
        await tx.wait();

        for (let i = 0; i < 89; i++) {
          await market.incrementEpochE();
        }
        tx = await market.stepE();
        txRecp = await tx.wait();
      });

      it("emits CouponExpiration event", async function () {
        await expectEventIn(txRecp, "CouponExpiration", {
          epoch: BN(2),
          couponsExpired: BN(100000 + premium(1000000, 100000, 100000)),
          lessRedeemable: BN(100000),
          lessDebt: BN(0),
          newBonded: BN(22500),
        });
      });
    });

    describe("with bonded", function () {
      beforeEach(async function () {
        await market.mintToE(market.address, 100000);
        await market.incrementTotalBondedE(100000);
      });

      describe("on call with all reclaimed", function () {
        this.timeout(30000);

        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await market.incrementTotalDebtE(100000);
          await market.connect(user).purchaseCoupons(100000);

          await market.mintToE(market.address, 100000);
          await market.incrementTotalRedeemableE(100000);

          await market.incrementEpochE();
          let tx = await market.stepE();
          await tx.wait();

          for (let i = 0; i < 89; i++) {
            await market.incrementEpochE();
          }
          tx = await market.stepE();
          txRecp = await tx.wait();
        });

        it("emits CouponExpiration event", async function () {
          await expectEventIn(txRecp, "CouponExpiration", {
            epoch: BN(2),
            couponsExpired: BN(100000 + premium(1100000, 100000, 100000)).sub(BN(1)),
            lessRedeemable: BN(100000),
            lessDebt: BN(0),
            newBonded: BN(100000),
          });
        });
      });

      describe("on call with some reclaimed", function () {
        this.timeout(30000);

        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await market.incrementTotalDebtE(100000);
          await market.connect(user).purchaseCoupons(50000);

          await market.incrementEpochE();
          await market.connect(user).purchaseCoupons(50000);

          await market.mintToE(market.address, 100000);
          await market.incrementTotalRedeemableE(100000);

          let tx = await market.stepE();
          await tx.wait();

          for (let i = 0; i < 89; i++) {
            await market.incrementEpochE();
          }
          tx = await market.stepE();
          txRecp = await tx.wait();
        });

        it("emits CouponExpiration event", async function () {
          await expectEventIn(txRecp, "CouponExpiration", {
            epoch: BN(2),
            couponsExpired: BN(50000 + premium(1100000, 100000, 50000)),
            lessDebt: BN(0),
            newBonded: BN(100000 - 50000 - premium(1050000, 50000, 50000)).add(BN(1)),
          });
        });
      });

      describe("with some debt", function () {
        this.timeout(30000);

        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await market.incrementTotalDebtE(150000);
          await market.connect(user).purchaseCoupons(50000);

          await market.incrementEpochE();
          await market.connect(user).purchaseCoupons(50000);

          await market.mintToE(market.address, 100000);
          await market.incrementTotalRedeemableE(100000);

          let tx = await market.stepE();
          await tx.wait();

          for (let i = 0; i < 89; i++) {
            await market.incrementEpochE();
          }
          tx = await market.stepE();
          txRecp = await tx.wait();
        });

        it("emits CouponExpiration event", async function () {
          await expectEventIn(txRecp, "CouponExpiration", {
            epoch: BN(2),
            couponsExpired: BN(50000 + premium(1100000, 150000, 50000)),
            lessRedeemable: BN(100000 - 50000 - premium(1050000, 100000, 50000)),
            lessDebt: BN(0),
            newBonded: BN(100000 - 50000 - premium(1050000, 100000, 50000)),
          });
        });
      });

      describe("with more reclaimed than debt", function () {
        this.timeout(30000);

        let txRecp: ContractReceipt;

        beforeEach(async function () {
          await market.incrementTotalDebtE(120000);
          await market.connect(user).purchaseCoupons(50000);

          await market.incrementEpochE();
          await market.connect(user).purchaseCoupons(50000);

          await market.mintToE(market.address, 100000);
          await market.incrementTotalRedeemableE(100000);

          let tx = await market.stepE();
          await tx.wait();

          for (let i = 0; i < 89; i++) {
            await market.incrementEpochE();
          }
          tx = await market.stepE();
          txRecp = await tx.wait();
        });

        it("emits CouponExpiration event", async function () {
          await expectEventIn(txRecp, "CouponExpiration", {
            epoch: BN(2),
            couponsExpired: BN(50000 + premium(1100000, 120000, 50000)),
            lessRedeemable: BN(100000 - 50000 - premium(1050000, 70000, 50000)),
            lessDebt: BN(0),
            newBonded: BN(100000 - 50000 - premium(1050000, 70000, 50000)),
          });
        });
      });
    });
  });
});
