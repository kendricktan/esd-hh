import { ethers } from "hardhat";
import { expectBNEq, expectRevert, BN } from "../Utils";

import { BOOTSTRAPPING_PERIOD } from "../Constants";
import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

describe("Comptroller", function () {
  let [owner, user, pool, circulator]: SignerWithAddress[] = [];
  let MockComptroller: ContractFactory;

  let dollar: Contract;
  let comptroller: Contract;

  before(async function () {
    [owner, user, pool, circulator] = await ethers.getSigners();
    MockComptroller = await ethers.getContractFactory("MockComptroller");
  });

  beforeEach(async function () {
    comptroller = await MockComptroller.connect(owner).deploy(pool.address, { gasLimit: 8000000 });
    dollar = await ethers.getContractAt("Dollar", await comptroller.dollar());
  });

  describe("mintToAccount", function () {
    beforeEach(async function () {
      await comptroller.mintToAccountE(circulator.address, BN(10000));
      const debt = await comptroller.totalDebt();
      await comptroller.decreaseDebtE(debt);
    });

    describe("bootstrapping", function () {
      describe("on single call", function () {
        beforeEach(async function () {
          await comptroller.mintToAccountE(user.address, BN(100));
        });

        it("mints new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(10100));
          expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
          expectBNEq(await dollar.balanceOf(user.address), BN(100));
        });

        it("doesnt update total debt", async function () {
          expectBNEq(await comptroller.totalDebt(), BN(0));
        });
      });

      describe("multiple calls", function () {
        beforeEach(async function () {
          await comptroller.mintToAccountE(user.address, BN(100));
          await comptroller.mintToAccountE(user.address, BN(200));
        });

        it("mints new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(10300));
          expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
          expectBNEq(await dollar.balanceOf(user.address), BN(300));
        });

        it("doesnt update total debt", async function () {
          expectBNEq(await comptroller.totalDebt(), BN(0));
        });
      });
    });

    describe("bootstrapped", function () {
      this.timeout(30000);

      beforeEach(async function () {
        for (let i = 0; i < BOOTSTRAPPING_PERIOD + 1; i++) {
          await comptroller.incrementEpochE();
        }
      });

      describe("on single call", function () {
        beforeEach(async function () {
          await comptroller.mintToAccountE(user.address, BN(100));
        });

        it("mints new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(10100));
          expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
          expectBNEq(await dollar.balanceOf(user.address), BN(100));
        });

        it("updates total debt", async function () {
          expectBNEq(await comptroller.totalDebt(), BN(100));
        });
      });

      describe("multiple calls", function () {
        beforeEach(async function () {
          await comptroller.mintToAccountE(user.address, BN(100));
          await comptroller.mintToAccountE(user.address, BN(200));
        });

        it("mints new Dollar tokens", async function () {
          expectBNEq(await dollar.totalSupply(), BN(10300));
          expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
          expectBNEq(await dollar.balanceOf(user.address), BN(300));
        });

        it("updates total debt", async function () {
          expectBNEq(await comptroller.totalDebt(), BN(300));
        });
      });
    });
  });

  describe("burnFromAccount", function () {
    beforeEach(async function () {
      await comptroller.mintToAccountE(circulator.address, BN(10000));
      const debt = await comptroller.totalDebt();
      await comptroller.decreaseDebtE(debt);

      await comptroller.mintToE(user.address, BN(1000));
      await comptroller.increaseDebtE(BN(1000));
      await dollar.connect(user).approve(comptroller.address, BN(1000));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await comptroller.burnFromAccountE(user.address, BN(100));
      });

      it("destroys Dollar tokens", async function () {
        expectBNEq(await dollar.totalSupply(), BN(10900));
        expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
        expectBNEq(await dollar.balanceOf(user.address), BN(900));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(900));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await comptroller.burnFromAccountE(user.address, BN(100));
        await comptroller.burnFromAccountE(user.address, BN(200));
      });

      it("destroys Dollar tokens", async function () {
        expectBNEq(await dollar.totalSupply(), BN(10700));
        expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
        expectBNEq(await dollar.balanceOf(user.address), BN(700));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(700));
      });
    });

    describe("call when not enough debt", function () {
      beforeEach(async function () {
        await comptroller.decreaseDebtE(BN(900));
      });

      it("reverts", async function () {
        await expectRevert(comptroller.burnFromAccountE(user.address, BN(200)), "not enough outstanding debt");
      });
    });
  });

  describe("redeemToAccount", function () {
    beforeEach(async function () {
      await comptroller.mintToE(comptroller.address, BN(300));
      await comptroller.incrementTotalRedeemableE(BN(300));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await comptroller.redeemToAccountE(user.address, BN(100));
      });

      it("doesnt mint new Dollar tokens", async function () {
        expectBNEq(await dollar.totalSupply(), BN(300));
        expectBNEq(await dollar.balanceOf(comptroller.address), BN(200));
        expectBNEq(await dollar.balanceOf(user.address), BN(100));
      });

      it("updates total redeemable", async function () {
        expectBNEq(await comptroller.totalRedeemable(), BN(200));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await comptroller.redeemToAccountE(user.address, BN(100));
        await comptroller.redeemToAccountE(user.address, BN(200));
      });

      it("doesnt mint new Dollar tokens", async function () {
        expectBNEq(await dollar.totalSupply(), BN(300));
        expectBNEq(await dollar.balanceOf(comptroller.address), BN(0));
        expectBNEq(await dollar.balanceOf(user.address), BN(300));
      });

      it("updates total redeemable", async function () {
        expectBNEq(await comptroller.totalRedeemable(), BN(0));
      });
    });

    describe("call when not enough redeemable", function () {
      beforeEach(async function () {
        await comptroller.incrementTotalBondedE(BN(100));
        await comptroller.mintToE(comptroller.address, BN(100));

        await comptroller.mintToE(comptroller.address, BN(100));
        await comptroller.incrementTotalBondedE(BN(100));
      });

      it("reverts", async function () {
        await expectRevert(comptroller.redeemToAccountE(user.address, BN(400)), "not enough redeemable");
      });
    });
  });

  describe("increaseDebt", function () {
    beforeEach(async function () {
      await comptroller.mintToE(user.address, BN(1000));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(100));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(100));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(10));
        await comptroller.increaseDebtE(BN(20));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(30));
      });
    });

    describe("increase past cap", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(100));
        await comptroller.increaseDebtE(BN(300));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(150));
      });
    });

    describe("increase past supply", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(100));
        await comptroller.increaseDebtE(BN(1000));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(150));
      });
    });
  });

  describe("decreaseDebt", function () {
    beforeEach(async function () {
      await comptroller.mintToE(user.address, BN(1000));
      await comptroller.increaseDebtE(BN(150));
    });

    describe("on single call", function () {
      beforeEach(async function () {
        await comptroller.decreaseDebtE(BN(100));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(50));
      });
    });

    describe("multiple calls", function () {
      beforeEach(async function () {
        await comptroller.decreaseDebtE(BN(10));
        await comptroller.decreaseDebtE(BN(20));
      });

      it("updates total debt", async function () {
        expectBNEq(await comptroller.totalDebt(), BN(120));
      });
    });

    describe("decrease past supply", function () {
      it("reverts", async function () {
        await expectRevert(comptroller.decreaseDebtE(BN(200)), "not enough debt");
      });
    });
  });

  describe("resetDebt", function () {
    beforeEach(async function () {
      await comptroller.mintToE(comptroller.address, BN(10000));
      const debt = await comptroller.totalDebt();
      await comptroller.decrementTotalDebtE(debt, "");
      await comptroller.incrementTotalBondedE(BN(10000));
    });

    describe("excess debt", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(5000));
        await comptroller.resetDebtE(BN(10));
      });

      it("decreases debt", async function () {
        expectBNEq(await dollar.totalSupply(), BN(10000));
        expectBNEq(await comptroller.totalDebt(), BN(1000));
      });
    });

    describe("equal debt", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(3000));
        await comptroller.resetDebtE(BN(10));
      });

      it("debt unchanged", async function () {
        expectBNEq(await dollar.totalSupply(), BN(10000));
        expectBNEq(await comptroller.totalDebt(), BN(1000));
      });
    });

    describe("less debt", function () {
      beforeEach(async function () {
        await comptroller.increaseDebtE(BN(500));
        await comptroller.resetDebtE(BN(10));
      });

      it("debt unchanged", async function () {
        expectBNEq(await dollar.totalSupply(), BN(10000));
        expectBNEq(await comptroller.totalDebt(), BN(500));
      });
    });
  });
});
