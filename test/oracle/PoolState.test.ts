import { ethers } from "hardhat";
import { expectBNEq, expectRevert, BN } from "../Utils";

import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

describe("PollState", function () {
  let [owner, user, user2]: SignerWithAddress[] = [];

  let MockPoolState: ContractFactory;
  let MockSettableDAO: ContractFactory;
  let MockToken: ContractFactory;

  let dao: Contract;
  let dollar: Contract;
  let setters: Contract;

  before(async function () {
    [owner, user, user2] = await ethers.getSigners();

    MockPoolState = await ethers.getContractFactory("MockPoolState");
    MockSettableDAO = await ethers.getContractFactory("MockSettableDAO");
    MockToken = await ethers.getContractFactory("MockToken");
  });

  beforeEach(async function () {
    dao = await MockSettableDAO.connect(owner).deploy();
    dollar = await MockToken.connect(owner).deploy("Empty Set Dollar", "ESD", 18);
    setters = await MockPoolState.connect(owner).deploy();
    await setters.set(dao.address, dollar.address);
  });

  /**
   * Account
   */

  describe("incrementBalanceOfBonded", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfBondedE(user.address, 100);
        await setters.incrementBalanceOfBondedE(user.address, 100);
      });

      it("increments balance of phantom for user", async function () {
        expectBNEq(await setters.balanceOfBonded(user.address), BN(200));
      });

      it("increments total phantom", async function () {
        expectBNEq(await setters.totalBonded(), BN(200));
      });
    });
  });

  describe("decrementBalanceOfBonded", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfBondedE(user.address, 500);
        await setters.decrementBalanceOfBondedE(user.address, 100, "decrementBalanceOfBondedE - 1");
        await setters.decrementBalanceOfBondedE(user.address, 100, "decrementBalanceOfBondedE - 2");
      });

      it("decrements balance of phantom for user", async function () {
        expectBNEq(await setters.balanceOfBonded(user.address), BN(300));
      });

      it("decrements total phantom", async function () {
        expectBNEq(await setters.totalBonded(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfBondedE(user.address, 100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementBalanceOfBondedE(200, "decrementBalanceOfBondedE"),
          "missing argument",
        );
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

  describe("incrementBalanceOfClaimable", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfClaimableE(user.address, 100);
        await setters.incrementBalanceOfClaimableE(user.address, 100);
      });

      it("increments balance of claimable for user", async function () {
        expectBNEq(await setters.balanceOfClaimable(user.address), BN(200));
      });

      it("increments total claimable", async function () {
        expectBNEq(await setters.totalClaimable(), BN(200));
      });
    });
  });

  describe("decrementBalanceOfClaimable", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfClaimableE(user.address, 500);
        await setters.decrementBalanceOfClaimableE(user.address, 100, "decrementBalanceOfClaimableE - 1");
        await setters.decrementBalanceOfClaimableE(user.address, 100, "decrementBalanceOfClaimableE - 2");
      });

      it("decrements balance of claimable for user", async function () {
        expectBNEq(await setters.balanceOfClaimable(user.address), BN(300));
      });

      it("decrements total claimable", async function () {
        expectBNEq(await setters.totalClaimable(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfClaimableE(user.address, 100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementBalanceOfClaimableE(200, "decrementBalanceOfClaimableE"),
          "missing argument",
        );
      });
    });
  });

  describe("incrementBalanceOfPhantom", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfPhantomE(user.address, 100);
        await setters.incrementBalanceOfPhantomE(user.address, 100);
      });

      it("increments balance of phantom for user", async function () {
        expectBNEq(await setters.balanceOfPhantom(user.address), BN(200));
      });

      it("increments total phantom", async function () {
        expectBNEq(await setters.totalPhantom(), BN(200));
      });
    });
  });

  describe("decrementBalanceOfPhantom", function () {
    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfPhantomE(user.address, 500);
        await setters.decrementBalanceOfPhantomE(user.address, 100, "decrementBalanceOfPhantomE - 1");
        await setters.decrementBalanceOfPhantomE(user.address, 100, "decrementBalanceOfPhantomE - 2");
      });

      it("decrements balance of phantom for user", async function () {
        expectBNEq(await setters.balanceOfPhantom(user.address), BN(300));
      });

      it("decrements total phantom", async function () {
        expectBNEq(await setters.totalPhantom(), BN(300));
      });
    });

    describe("when called erroneously", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfPhantomE(user.address, 100);
      });

      it("reverts", async function () {
        await expectRevert(
          setters.decrementBalanceOfPhantomE(200, "decrementBalanceOfPhantomE"),
          "missing argument",
        );
      });
    });
  });

  describe("unfreeze", function () {
    describe("before called", function () {
      it("is frozen", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(0));
      });
    });

    describe("when called", function () {
      beforeEach("call", async function () {
        await setters.unfreezeE(user.address);
      });

      it("is fluid", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(1));
      });
    });

    describe("when called then advanced within lockup", function () {
      beforeEach("call", async function () {
        await setters.unfreezeE(user.address);
        await dao.set(1);
      });

      it("is frozen", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(1));
      });
    });
    describe("when called then advanced after lockup", function () {
      beforeEach("call", async function () {
        await setters.unfreezeE(user.address);
        await dao.set(5);
      });

      it("is frozen", async function () {
        expectBNEq(await setters.statusOf(user.address), BN(0));
      });
    });
  });

  describe("rewarded", function () {
    describe("no user", function () {
      beforeEach("call", async function () {
        await dollar.mint(setters.address, 500);
      });

      it("reward display correctly", async function () {
        expectBNEq(await setters.balanceOfRewarded(user.address), BN(0));
        expectBNEq(await setters.totalRewarded(), BN(500));
      });
    });

    describe("single user", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfBondedE(user.address, 100);
      });

      describe("when called", function () {
        beforeEach("call", async function () {
          await dollar.mint(setters.address, 500);
        });

        it("reward display correctly", async function () {
          expectBNEq(await setters.balanceOfRewarded(user.address), BN(500));
          expectBNEq(await setters.totalRewarded(), BN(500));
        });
      });
    });

    describe("multiple user", function () {
      beforeEach("call", async function () {
        await setters.incrementBalanceOfBondedE(user.address, 100);
        await setters.incrementBalanceOfBondedE(user2.address, 300);
      });

      describe("when called", function () {
        beforeEach("call", async function () {
          await dollar.mint(setters.address, 500);
        });

        it("reward display correctly", async function () {
          expectBNEq(await setters.balanceOfRewarded(user.address), BN(125));
          expectBNEq(await setters.balanceOfRewarded(user2.address), BN(375));
          expectBNEq(await setters.totalRewarded(), BN(500));
        });
      });
    });
  });
});
