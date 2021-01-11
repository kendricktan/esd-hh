import { ethers } from "hardhat";
import { expectEventIn } from "../Utils";

import { Contract, ContractFactory, ContractReceipt } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expect } from "chai";
describe("Upgradeable", function () {
  let owner: SignerWithAddress;
  let MockUpgradeable: ContractFactory;
  let MockImplA: ContractFactory;
  let MockImplB: ContractFactory;

  let upgradeable: Contract;
  let implA: Contract;
  let implB: Contract;

  before(async function () {
    [owner] = await ethers.getSigners();
    MockUpgradeable = await ethers.getContractFactory("MockUpgradeable");
    MockImplA = await ethers.getContractFactory("MockImplA");
    MockImplB = await ethers.getContractFactory("MockImplB");
  });

  beforeEach(async function () {
    upgradeable = await MockUpgradeable.connect(owner).deploy();
    implA = await MockImplA.connect(owner).deploy();
    implB = await MockImplB.connect(owner).deploy();
  });

  describe("set initial implementation", function () {
    let txRecp: ContractReceipt;

    beforeEach(async function () {
      const tx = await upgradeable.upgradeToE(implA.address);
      txRecp = await tx.wait();
    });

    it("sets implementation correctly", async function () {
      expect(await upgradeable.implementation()).to.be.equal(implA.address);
      expect(await upgradeable.isInitialized(implA.address)).to.be.equal(true);
    });

    it("emits MockInitializedA event", async function () {
      expectEventIn(txRecp, "Upgraded", {});
    });

    it("emits Upgraded event", async function () {
      await expectEventIn(txRecp, "Upgraded", {
        implementation: implA.address,
      });
    });
  });

  describe("upgrades after initial implementation", function () {
    let txRecp: ContractReceipt;
    beforeEach(async function () {
      await upgradeable.upgradeToE(implA.address);
      const tx = await upgradeable.upgradeToE(implB.address);
      txRecp = await tx.wait();
    });

    it("sets implementation correctly", async function () {
      expect(await upgradeable.implementation()).to.be.equal(implB.address);
      expect(await upgradeable.isInitialized(implB.address)).to.be.equal(true);
    });

    it("emits MockInitializedA event", async function () {
      await expectEventIn(txRecp, "Upgraded", {});
    });

    it("emits Upgraded event", async function () {
      await expectEventIn(txRecp, "Upgraded", {
        implementation: implB.address,
      });
    });
  });
});
