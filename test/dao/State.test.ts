import { ethers } from "hardhat";
import { expectBNEq, expectRevert, BN } from "../Utils";

import { BigNumber, Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expect } from "chai";

const BOOTSTRAPPING_END_TIMESTAMP = 1600905600;
const EPOCH_START = 1602288000;
const EPOCH_OFFSET = 107;

describe("State", function () {
  let [owner, user, candidate]: SignerWithAddress[] = [];
  let MockState: ContractFactory;
  let setters: Contract;

  before(async function () {
    [owner, user, candidate] = await ethers.getSigners();
    MockState = await ethers.getContractFactory("MockState");
  });

  beforeEach(async function () {
    setters = await MockState.connect(owner).deploy();
  });

  /**
   * Erc20 Implementation
   */

  describe("erc20 details", function () {
    describe("name", function () {
      it("increments total bonded", async function () {
        expect(await setters.name()).to.be.equal("Empty Set Dollar Stake");
      });
    });

    describe("symbol", function () {
      it("increments total bonded", async function () {
        expect(await setters.symbol()).to.be.equal("ESDS");
      });
    });

    describe("decimals", function () {
      it("increments total bonded", async function () {
        expectBNEq(await setters.decimals(), BN(18));
      });
    });
  });

  describe("approve", function () {
    describe("when called", function () {
      let success: boolean;

      beforeEach("call", async function () {
        success = await setters.connect(user).callStatic.approve(owner.address, 100);
      });

      it("increments total bonded", async function () {
        expect(success).to.be.equal(false);
      });
    });
  });

  describe("transfer", function () {
    describe("when called", function () {
      let success: boolean;
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        success = await setters.connect(user).callStatic.transfer(owner.address, 100);
      });

      it("increments total bonded", async function () {
        expect(success).to.be.equal(false);
      });
    });
  });

  describe("transferFrom", function () {
    describe("when called", function () {
      let success: boolean;

      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        success = await setters.connect(user).callStatic.transferFrom(user.address, owner.address, 100);
      });

      it("increments total bonded", async function () {
        expect(success).to.be.equal(false);
      });
    });
  });

  describe("allowance", function () {
    describe("when called", function () {
      let allowance: BigNumber;
      beforeEach("not revert", async function () {
        allowance = await setters.allowance(user.address, owner.address);
      });

      it("is 0", async function () {
        expectBNEq(allowance, BN(0));
      });
    });
  });

  /**
   * Global
   */

  describe("incrementTotalBonded", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalBondedE(100);
        await setters.incrementTotalBondedE(100);
      });

      it("increments total bonded", async function () {
        expectBNEq(await setters.totalBonded(), BN(200));
      });
    });
  });

  describe("decrementTotalBonded", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalBondedE(500);
        await setters.decrementTotalBondedE(100, "decrementTotalBondedE - 1");
        await setters.decrementTotalBondedE(100, "decrementTotalBondedE - 2");
      });

      it("decrements total bonded", async function () {
        expectBNEq(await setters.totalBonded(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalBondedE(100);
      });

      it("reverts", async function () {
        await expectRevert(setters.decrementTotalBondedE(200, "decrementTotalBondedE"), "revert");
      });
    });
  });

  describe("incrementTotalDebt", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalDebtE(100);
        await setters.incrementTotalDebtE(100);
      });

      it("increments total debt", async function () {
        expectBNEq(await setters.totalDebt(), BN(200));
      });
    });
  });

  describe("decrementTotalDebt", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalDebtE(500);
        await setters.decrementTotalDebtE(100, "decrementTotalDebtE - 1");
        await setters.decrementTotalDebtE(100, "decrementTotalDebtE - 2");
      });

      it("decrements total debt", async function () {
        expectBNEq(await setters.totalDebt(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalDebtE(100);
      });

      it("reverts", async function () {
        await expectRevert(setters.decrementTotalDebtE(200, "decrementTotalDebtE"), "revert");
      });
    });
  });

  describe("incrementTotalRedeemable", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalRedeemableE(100);
        await setters.incrementTotalRedeemableE(100);
      });

      it("increments total redeemable", async function () {
        expectBNEq(await setters.totalRedeemable(), BN(200));
      });
    });
  });

  describe("decrementTotalRedeemable", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalRedeemableE(500);
        await setters.decrementTotalRedeemableE(100, "decrementTotalRedeemableE - 1");
        await setters.decrementTotalRedeemableE(100, "decrementTotalRedeemableE - 2");
      });

      it("decrements total redeemable", async function () {
        expectBNEq(await setters.totalRedeemable(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementTotalRedeemableE(100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementTotalRedeemableE(200, "decrementTotalRedeemableE"),
          "revert",
        );
      });
    });
  });

  /**
   * Account
   */

  describe("incrementBalanceOf", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        await setters.incrementBalanceOfE(user.address, 100);
      });

      it("increments balance of user", async function () {
        expectBNEq(await setters.balanceOf(user.address), BN(200));
      });

      it("increments total supply", async function () {
        expectBNEq(await setters.totalSupply(), BN(200));
      });
    });
  });

  describe("decrementBalanceOf", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 500);
        await setters.decrementBalanceOfE(user.address, 100, "decrementBalanceOfE - 1");
        await setters.decrementBalanceOfE(user.address, 100, "decrementBalanceOfE - 2");
      });

      it("decrements balance of user", async function () {
        expectBNEq(await setters.balanceOf(user.address), BN(300));
      });

      it("decrements total supply", async function () {
        expectBNEq(await setters.totalSupply(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
      });

      it("reverts", async function () {
        await expectRevert(setters.decrementBalanceOfE(200, "decrementBalanceOfE"), "missing argument");
      });
    });
  });

  describe("incrementBalanceOfStaged", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfStagedE(user.address, 100);
        await setters.incrementBalanceOfStagedE(user.address, 100);
      });

      it("increments balance of staged for user", async function () {
        expectBNEq(await setters.balanceOfStaged(user.address), BN(200));
      });

      it("increments total staged", async function () {
        expectBNEq(await setters.totalStaged(), BN(200));
      });
    });
  });

  describe("decrementBalanceOfStaged", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfStagedE(user.address, 500);
        await setters.decrementBalanceOfStagedE(user.address, 100, "decrementBalanceOfStagedE - 1");
        await setters.decrementBalanceOfStagedE(user.address, 100, "decrementBalanceOfStagedE - 2");
      });

      it("decrements balance of staged for user", async function () {
        expectBNEq(await setters.balanceOfStaged(user.address), BN(300));
      });

      it("decrements total staged", async function () {
        expectBNEq(await setters.totalStaged(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfStagedE(user.address, 100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementBalanceOfStagedE(200, "decrementBalanceOfStagedE"),
          "missing argument",
        );
      });
    });
  });

  describe("incrementBalanceOfCoupons", function () {
    const epoch = 1;

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfCouponsE(user.address, epoch, 100);
        await setters.incrementBalanceOfCouponsE(user.address, epoch, 100);
      });

      it("increments balance of coupons for user during epoch", async function () {
        expectBNEq(await setters.balanceOfCoupons(user.address, epoch), BN(200));
      });

      it("increments outstanding coupons for epoch", async function () {
        expectBNEq(await setters.outstandingCoupons(epoch), BN(200));
      });

      it("increments total outstanding coupons", async function () {
        expectBNEq(await setters.totalCoupons(), BN(200));
      });
    });
  });

  describe("decrementBalanceOfCoupons", function () {
    const epoch = 1;

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfCouponsE(user.address, epoch, 500);
        await setters.decrementBalanceOfCouponsE(user.address, epoch, 100, "decrementBalanceOfCouponsE - 1");
        await setters.decrementBalanceOfCouponsE(user.address, epoch, 100, "decrementBalanceOfCouponsE - 2");
      });

      it("decrements balance of coupons for user during epoch", async function () {
        expectBNEq(await setters.balanceOfCoupons(user.address, epoch), BN(300));
      });

      it("decrements outstanding coupons for epoch", async function () {
        expectBNEq(await setters.outstandingCoupons(epoch), BN(300));
      });

      it("decrements total outstanding coupons", async function () {
        expectBNEq(await setters.totalCoupons(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfCouponsE(user.address, epoch, 100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementBalanceOfCouponsE(200, epoch, "decrementBalanceOfCouponsE"),
          "missing argument",
        );
      });
    });
  });

  describe("balanceOfBonded", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        await setters.incrementTotalBondedE(100);
        await setters.incrementBalanceOfE(owner.address, 200);
        await setters.incrementTotalBondedE(200);
      });

      it("returns balance of bonded", async function () {
        expectBNEq(await setters.balanceOfBonded(user.address), BN(100));
      });
    });

    describe("pool reward", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        await setters.incrementTotalBondedE(100);

        await setters.incrementBalanceOfE(owner.address, 200);
        await setters.incrementTotalBondedE(200);

        await setters.incrementTotalBondedE(150);
      });

      it("increments balance of bonded", async function () {
        expectBNEq(await setters.balanceOfBonded(user.address), BN(150));
      });
    });

    describe("pool reward and withdrawal", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        await setters.incrementTotalBondedE(100);

        await setters.incrementBalanceOfE(owner.address, 200);
        await setters.incrementTotalBondedE(200);

        await setters.incrementTotalBondedE(150);

        await setters.decrementBalanceOfE(owner.address, 200, "decrementBalanceOfE");
        await setters.decrementTotalBondedE(300, "decrementTotalBondedE");
      });

      it("increments balance of bonded", async function () {
        expectBNEq(await setters.balanceOfBonded(user.address), BN(150));
      });
    });
  });

  describe("unfreeze", function () {
    describe("before called", function () {
      it("is frozen", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(0));
        expectBNEq(await setters.fluidUntil(user.address), BN(0));
      });
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.unfreezeE(user.address);
      });

      it("is fluid", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(1));
        expectBNEq(await setters.fluidUntil(user.address), BN(15));
      });
    });

    describe("when called then advanced within lockup", function () {
      beforeEach("call", async function () {
        await setters.unfreezeE(user.address);
        await setters.incrementEpochE();
      });

      it("is fluid", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(1));
        expectBNEq(await setters.fluidUntil(user.address), BN(15));
      });
    });

    describe("when called then advanced after lockup", function () {
      beforeEach("call", async function () {
        await setters.unfreezeE(user.address);
        for (let i = 0; i < 15; i++) {
          await setters.incrementEpochE();
        }
      });

      it("is frozen", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(0));
        expectBNEq(await setters.fluidUntil(user.address), BN(15));
      });
    });
  });

  describe("updateAllowanceCoupons", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.updateAllowanceCouponsE(user.address, owner.address, 100);
      });

      it("updates coupon allowance", async function () {
        expectBNEq(await setters.allowanceCoupons(user.address, owner.address), BN(100));
      });
    });

    describe("when called multiple", function () {
      beforeEach("call", async function () {
        await setters.updateAllowanceCouponsE(user.address, owner.address, 100);
        await setters.updateAllowanceCouponsE(user.address, owner.address, 200);
      });

      it("updates coupon allowance", async function () {
        expectBNEq(await setters.allowanceCoupons(user.address, owner.address), BN(200));
      });
    });
  });

  describe("decrementAllowanceCoupons", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.updateAllowanceCouponsE(user.address, owner.address, 500);
        await setters.decrementAllowanceCouponsE(user.address, owner.address, 100, "decrementCouponAllowanceE - 1");
      });

      it("decrements coupon allowance", async function () {
        expectBNEq(await setters.allowanceCoupons(user.address, owner.address), BN(400));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.updateAllowanceCouponsE(user.address, owner.address, 100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementAllowanceCouponsE(user.address, owner.address, 200, "decrementAllowanceCouponsE"),
          "revert",
        );
      });
    });
  });

  /**
   * Epoch
   */

  describe("epochTime", function () {
    beforeEach("call", async function () {
      await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP);
    });

    describe("before start", function () {
      it("is 91", async function () {
        expectBNEq(await setters.epochTime(), BN(91));
      });
    });

    describe("after one period", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 86400);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(92));
      });
    });

    describe("after many periods", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 10 * 86400);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(101));
      });
    });

    describe("one before update advance", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 14 * 86400);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(105));
      });
    });

    describe("right before update advance", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 15 * 86400 - 1);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(105));
      });
    });

    describe("at update advance", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 15 * 86400);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(106));
      });
    });

    describe("at first after update advance", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 15 * 86400 + 28800);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(107));
      });
    });

    describe("many after update advance", function () {
      beforeEach("call", async function () {
        await setters.setBlockTimestamp(BOOTSTRAPPING_END_TIMESTAMP + 15 * 86400 + 10 * 28800);
      });

      it("has advanced", async function () {
        expectBNEq(await setters.epochTime(), BN(116));
      });
    });
  });

  describe("incrementEpoch", function () {
    describe("before called", function () {
      it("is 0", async function () {
        expectBNEq(await setters.epoch(), BN(0));
      });
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementEpochE();
      });

      it("is unbonding", async function () {
        expectBNEq(await setters.epoch(), BN(1));
      });
    });

    describe("when called multiple times", function () {
      beforeEach("call", async function () {
        await setters.incrementEpochE();
        await setters.incrementEpochE();
      });

      it("is bonded", async function () {
        expectBNEq(await setters.epoch(), BN(2));
      });
    });
  });

  describe("snapshotTotalBonded", function () {
    beforeEach("call", async function () {
      await setters.incrementEpochE();
    });

    describe("before called", function () {
      it("is 0", async function () {
        expectBNEq(await setters.totalBondedAt(1), BN(0));
      });
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        await setters.snapshotTotalBondedE();
      });

      it("is snapshotted", async function () {
        expectBNEq(await setters.totalBondedAt(1), BN(100));
      });
    });

    describe("when called multiple times", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfE(user.address, 100);
        await setters.snapshotTotalBondedE();
        await setters.incrementEpochE();

        await setters.incrementBalanceOfE(user.address, 100);
        await setters.snapshotTotalBondedE();
      });

      it("is snapshotted for both epochs", async function () {
        expectBNEq(await setters.totalBondedAt(1), BN(100));
        expectBNEq(await setters.totalBondedAt(2), BN(200));
      });
    });
  });

  describe("incrementEpoch", function () {
    describe("before called", function () {
      it("is 0", async function () {
        expectBNEq(await setters.epoch(), BN(0));
      });
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementEpochE();
      });

      it("is unbonding", async function () {
        expectBNEq(await setters.epoch(), BN(1));
      });
    });

    describe("when called multiple times", function () {
      beforeEach("call", async function () {
        await setters.incrementEpochE();
        await setters.incrementEpochE();
      });

      it("is bonded", async function () {
        expectBNEq(await setters.epoch(), BN(2));
      });
    });
  });

  describe("initializeCouponsExpiration", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.initializeCouponsExpirationE(2, 91);
      });

      it("has expiration set", async function () {
        expectBNEq(await setters.couponsExpiration(2), BN(91));
        expectBNEq(await setters.expiringCoupons(91), BN(1));
        expectBNEq(await setters.expiringCouponsAtIndex(91, 0), BN(2));
      });
    });
  });

  describe("eliminateOutstandingCoupons", function () {
    beforeEach("call", async function () {
      await setters.incrementBalanceOfCouponsE(user.address, 1, 100);
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.eliminateOutstandingCouponsE(1);
      });

      it("has expiration set", async function () {
        expectBNEq(await setters.totalCoupons(), BN(0));
        expectBNEq(await setters.outstandingCoupons(1), BN(0));
        expectBNEq(await setters.balanceOfCoupons(user.address, 1), BN(0));
      });
    });
  });

  describe("bootstrappingAt", function () {
    describe("while bootstrapping", function () {
      it("is bootstrapping", async function () {
        expect(await setters.bootstrappingAt(0)).to.be.equal(true);
      });

      it("is bootstrapping", async function () {
        expect(await setters.bootstrappingAt(1)).to.be.equal(true);
      });

      it("is bootstrapping", async function () {
        expect(await setters.bootstrappingAt(90)).to.be.equal(true);
      });
    });

    describe("bootstrapped", function () {
      it("isnt bootstrapping", async function () {
        expect(await setters.bootstrappingAt(91)).to.be.equal(false);
      });
    });
  });

  /**
   * Governance
   */

  describe("createcandidate.address", function () {
    beforeEach("call", async function () {
      await setters.incrementEpochE();
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.createCandidateE(candidate.address, 7);
      });

      it("has start and period set", async function () {
        expectBNEq(await setters.startFor(candidate.address), BN(1));
        expectBNEq(await setters.periodFor(candidate.address), BN(7));
        expect(await setters.isNominated(candidate.address)).to.be.equal(true);
      });
    });
  });

  describe("recordVote", function () {
    beforeEach("call", async function () {
      await setters.incrementEpochE();
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.recordVoteE(user.address, candidate.address, 1);
      });

      it("has recorded vote set", async function () {
        expectBNEq(await setters.recordedVote(user.address, candidate.address), BN(1));
      });
    });

    describe("when unvoting", function () {
      beforeEach("call", async function () {
        await setters.recordVoteE(user.address, candidate.address, 1);
        await setters.recordVoteE(user.address, candidate.address, 0);
      });

      it("has recorded vote set", async function () {
        expectBNEq(await setters.recordedVote(user.address, candidate.address), BN(0));
      });
    });

    describe("when revoting", function () {
      beforeEach("call", async function () {
        await setters.recordVoteE(user.address, candidate.address, 1);
        await setters.recordVoteE(user.address, candidate.address, 2);
      });

      it("has recorded vote set", async function () {
        expectBNEq(await setters.recordedVote(user.address, candidate.address), BN(2));
      });
    });
  });

  describe("incrementApproveFor", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementApproveForE(candidate.address, 100);
      });

      it("has approve for set", async function () {
        expectBNEq(await setters.approveFor(candidate.address), BN(100));
        expectBNEq(await setters.votesFor(candidate.address), BN(100));
      });
    });

    describe("when called multiple", function () {
      beforeEach("call", async function () {
        await setters.incrementApproveForE(candidate.address, 100);
        await setters.incrementApproveForE(candidate.address, 200);
      });

      it("has approve for set", async function () {
        expectBNEq(await setters.approveFor(candidate.address), BN(300));
        expectBNEq(await setters.votesFor(candidate.address), BN(300));
      });
    });
  });

  describe("decrementApproveFor", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementApproveForE(candidate.address, 1000);
        await setters.decrementApproveForE(candidate.address, 100, "decrementApproveForE");
      });

      it("has approve for set", async function () {
        expectBNEq(await setters.approveFor(candidate.address), BN(900));
        expectBNEq(await setters.votesFor(candidate.address), BN(900));
      });
    });

    describe("when called multiple", function () {
      beforeEach("call", async function () {
        await setters.incrementApproveForE(candidate.address, 1000);
        await setters.decrementApproveForE(candidate.address, 100, "decrementApproveForE");
        await setters.decrementApproveForE(candidate.address, 200, "decrementApproveForE");
      });

      it("has approve for set", async function () {
        expectBNEq(await setters.approveFor(candidate.address), BN(700));
        expectBNEq(await setters.votesFor(candidate.address), BN(700));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementApproveForE(candidate.address, 1000);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementApproveForE(candidate.address, 1100, "decrementApproveForE"),
          "revert",
        );
      });
    });
  });

  describe("incrementRejectFor", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementRejectForE(candidate.address, 100);
      });

      it("has reject for set", async function () {
        expectBNEq(await setters.rejectFor(candidate.address), BN(100));
        expectBNEq(await setters.votesFor(candidate.address), BN(100));
      });
    });

    describe("when called multiple", function () {
      beforeEach("call", async function () {
        await setters.incrementRejectForE(candidate.address, 100);
        await setters.incrementRejectForE(candidate.address, 200);
      });

      it("has reject for set", async function () {
        expectBNEq(await setters.rejectFor(candidate.address), BN(300));
        expectBNEq(await setters.votesFor(candidate.address), BN(300));
      });
    });
  });

  describe("decrementRejectFor", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementRejectForE(candidate.address, 1000);
        await setters.decrementRejectForE(candidate.address, 100, "decrementRejectForE");
      });

      it("has reject for set", async function () {
        expectBNEq(await setters.rejectFor(candidate.address), BN(900));
        expectBNEq(await setters.votesFor(candidate.address), BN(900));
      });
    });

    describe("when called multiple", function () {
      beforeEach("call", async function () {
        await setters.incrementRejectForE(candidate.address, 1000);
        await setters.decrementRejectForE(candidate.address, 100, "decrementRejectForE");
        await setters.decrementRejectForE(candidate.address, 200, "decrementRejectForE");
      });

      it("has reject for set", async function () {
        expectBNEq(await setters.rejectFor(candidate.address), BN(700));
        expectBNEq(await setters.votesFor(candidate.address), BN(700));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementRejectForE(candidate.address, 1000);
      });

      it("reverts", async function () {
        await expectRevert(setters.decrementRejectForE(candidate.address, 1100, "decrementRejectForE"), "revert");
      });
    });
  });

  describe("placeLock", function () {
    beforeEach("call", async function () {
      await setters.incrementEpochE();
      await setters.createCandidateE(candidate.address, 7);
    });

    describe("when voting", function () {
      beforeEach("call", async function () {
        await setters.placeLockE(user.address, candidate.address);
      });

      it("should have locked user", async function () {
        expect(await setters.isNominated(candidate.address)).to.be.equal(true);
        expectBNEq(await setters.statusOf(user.address), BN(2));
        expectBNEq(await setters.lockedUntil(user.address), BN(8));
      });
    });

    describe("when voting then wait", function () {
      beforeEach("call", async function () {
        await setters.placeLockE(user.address, candidate.address);

        await setters.incrementEpochE(); // 2
        await setters.incrementEpochE(); // 3
        await setters.incrementEpochE(); // 4
        await setters.incrementEpochE(); // 5
        await setters.incrementEpochE(); // 6
        await setters.incrementEpochE(); // 7
        await setters.incrementEpochE(); // 8
      });

      it("should have unlocked user", async function () {
        expect(await setters.isNominated(candidate.address)).to.be.equal(true);
        expectBNEq(await setters.statusOf(user.address), BN(0));
        expectBNEq(await setters.lockedUntil(user.address), BN(8));
      });
    });

    describe("when voting multiple", function () {
      beforeEach("call", async function () {
        await setters.placeLockE(user.address, candidate.address);

        await setters.incrementEpochE(); // 2
        await setters.incrementEpochE(); // 3
        await setters.createCandidateE(owner.address, 7);
        await setters.placeLockE(user.address, owner.address);
      });

      describe("and not waiting", function () {
        beforeEach("call", async function () {
          await setters.incrementEpochE(); // 4
          await setters.incrementEpochE(); // 5
          await setters.incrementEpochE(); // 6
          await setters.incrementEpochE(); // 7
          await setters.incrementEpochE(); // 8
        });

        it("should still lock user", async function () {
          expect(await setters.isNominated(candidate.address)).to.be.equal(true);
          expect(await setters.isNominated(owner.address)).to.be.equal(true);
          expectBNEq(await setters.statusOf(user.address), BN(2));
          expectBNEq(await setters.lockedUntil(user.address), BN(10));
        });
      });

      describe("and waiting", function () {
        beforeEach("call", async function () {
          await setters.incrementEpochE(); // 4
          await setters.incrementEpochE(); // 5
          await setters.incrementEpochE(); // 6
          await setters.incrementEpochE(); // 7
          await setters.incrementEpochE(); // 8
          await setters.incrementEpochE(); // 9
          await setters.incrementEpochE(); // 10
        });

        it("should have unlocked user", async function () {
          expect(await setters.isNominated(candidate.address)).to.be.equal(true);
          expectBNEq(await setters.statusOf(user.address), BN(0));
          expectBNEq(await setters.lockedUntil(user.address), BN(10));
        });
      });
    });

    describe("when voting multiple reverse", function () {
      beforeEach("call", async function () {
        await setters.incrementEpochE(); // 2
        await setters.incrementEpochE(); // 3
        await setters.createCandidateE(owner.address, 7);
        await setters.placeLockE(user.address, owner.address);
        await setters.placeLockE(user.address, candidate.address);
      });

      describe("and not waiting", function () {
        beforeEach("call", async function () {
          await setters.incrementEpochE(); // 4
          await setters.incrementEpochE(); // 5
          await setters.incrementEpochE(); // 6
          await setters.incrementEpochE(); // 7
          await setters.incrementEpochE(); // 8
        });

        it("should still lock user", async function () {
          expect(await setters.isNominated(candidate.address)).to.be.equal(true);
          expect(await setters.isNominated(owner.address)).to.be.equal(true);
          expectBNEq(await setters.statusOf(user.address), BN(2));
          expectBNEq(await setters.lockedUntil(user.address), BN(10));
        });
      });

      describe("and waiting", function () {
        beforeEach("call", async function () {
          await setters.incrementEpochE(); // 4
          await setters.incrementEpochE(); // 5
          await setters.incrementEpochE(); // 6
          await setters.incrementEpochE(); // 7
          await setters.incrementEpochE(); // 8
          await setters.incrementEpochE(); // 9
          await setters.incrementEpochE(); // 10
        });

        it("should have unlocked user", async function () {
          expect(await setters.isNominated(candidate.address)).to.be.equal(true);
          expectBNEq(await setters.statusOf(user.address), BN(0));
          expectBNEq(await setters.lockedUntil(user.address), BN(10));
        });
      });
    });
  });

  describe("initialized", function () {
    describe("before called", function () {
      it("is not initialized", async function () {
        expect(await setters.isInitialized(candidate.address)).to.be.equal(false);
      });
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.initializedE(candidate.address);
      });

      it("is initialized", async function () {
        expect(await setters.isInitialized(candidate.address)).to.be.equal(true);
      });
    });
  });
});
