import { ethers } from "hardhat";
import { expectBNEq, expectEventIn, expectRevert, getLatestBlockTime, BN } from "../Utils";

import { signTypedData } from "eth-sig-util";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Contract, ContractFactory, ContractReceipt, Wallet } from "ethers";

const { provider } = ethers;

const domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const permit = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

async function signPermit(dollar, privateKey, message) {
  const domainData = {
    name: "Empty Set Dollar",
    version: "1",
    chainId: "1",
    verifyingContract: dollar,
  };

  const data = {
    types: {
      EIP712Domain: domain,
      Permit: permit,
    },
    domain: domainData,
    primaryType: "Permit",
    message: message,
  };
  const pk = Buffer.from(privateKey.substring(2), "hex");

  // eslint-disable-next-line
  const sig = signTypedData(pk, { data } as any);

  return {
    v: parseInt(sig.substring(130, 132), 16),
    r: Buffer.from(sig.substring(2, 66), "hex"),
    s: Buffer.from(sig.substring(66, 130), "hex"),
  };
}

describe("Dollar", function () {
  let [owner, pool]: SignerWithAddress[] = [];
  let user: Wallet;

  let MockComptroller: ContractFactory;

  let dollar: Contract;
  let dao: Contract;

  before(async () => {
    [owner, pool] = await ethers.getSigners();

    user = ethers.Wallet.createRandom().connect(provider);

    // Give user some Ethers
    await owner.sendTransaction({
      to: user.address,
      value: ethers.utils.parseEther("5"),
    });

    MockComptroller = await ethers.getContractFactory("MockComptroller");
  });

  beforeEach(async function () {
    dao = await MockComptroller.connect(owner).deploy(pool.address, { gasLimit: 8000000 });
    dollar = await ethers.getContractAt("Dollar", await dao.dollar());
  });

  describe("mint", function () {
    describe("not from dao", function () {
      it("reverts", async function () {
        await expectRevert(
          dollar.connect(owner).mint(user.address, 100),
          "MinterRole: caller does not have the Minter role",
        );
      });
    });

    describe("from dao", function () {
      beforeEach(async function () {
        await dao.mintToE(user.address, 100);
      });

      it("mints new Dollar tokens", async function () {
        expectBNEq(await dollar.balanceOf(user.address), BN(100));
      });
    });
  });

  describe("delegate", function () {
    describe("zero deadline", function () {
      let signature: {
        v: number;
        r: Buffer;
        s: Buffer;
      };

      beforeEach(async function () {
        signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(1234).toString(),
          nonce: 0,
          deadline: 0,
        });
      });

      it("reverts", async function () {
        await expectRevert(
          dollar.permit(user.address, owner.address, 1234, 0, signature.v, signature.r, signature.s),
          "Permittable: Expired",
        );
      });
    });

    describe("valid expiration", function () {
      beforeEach(async function () {
        const expiration = (await getLatestBlockTime()) + 100;
        const signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(1234).toString(),
          nonce: 0,
          deadline: expiration,
        });

        await dollar.permit(user.address, owner.address, 1234, expiration, signature.v, signature.r, signature.s);
      });

      it("approves", async function () {
        expectBNEq(await dollar.allowance(user.address, owner.address), BN(1234));
      });
    });

    describe("invalid nonce", function () {
      let expiration: number;
      let signature: {
        v: number;
        r: Buffer;
        s: Buffer;
      };

      beforeEach(async function () {
        expiration = (await getLatestBlockTime()) + 100;
        signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(1234).toString(),
          nonce: 10,
          deadline: expiration,
        });
      });

      it("reverts", async function () {
        await expectRevert(
          dollar.permit(user.address, owner.address, 1234, expiration, signature.v, signature.r, signature.s),
          "Permittable: Invalid signature",
        );
      });
    });

    describe("nonce reuse", function () {
      let expiration: number;
      let signature: {
        v: number;
        r: Buffer;
        s: Buffer;
      };

      beforeEach(async function () {
        expiration = (await getLatestBlockTime()) + 100;
        signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(1234).toString(),
          nonce: 0,
          deadline: expiration,
        });

        await dollar.permit(user.address, owner.address, 1234, expiration, signature.v, signature.r, signature.s);

        signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(5678).toString(),
          nonce: 0,
          deadline: expiration,
        });
      });

      it("reverts", async function () {
        await expectRevert(
          dollar.permit(user.address, owner.address, 5678, expiration, signature.v, signature.r, signature.s),
          "Permittable: Invalid signature",
        );
      });
    });

    describe("expired", function () {
      let expiration: number;
      let signature: {
        v: number;
        r: Buffer;
        s: Buffer;
      };

      beforeEach(async function () {
        expiration = (await getLatestBlockTime()) - 100;
        signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(1234).toString(),
          nonce: 0,
          deadline: expiration,
        });
      });

      it("reverts", async function () {
        await expectRevert(
          dollar.permit(user.address, owner.address, 1234, expiration, signature.v, signature.r, signature.s),
          "Permittable: Expired",
        );
      });
    });

    describe("signature mismatch", function () {
      let expiration: number;
      let signature: {
        v: number;
        r: Buffer;
        s: Buffer;
      };

      beforeEach(async function () {
        expiration = (await getLatestBlockTime()) + 100;
        signature = await signPermit(dollar.address, user.privateKey, {
          owner: user.address,
          spender: owner.address,
          value: BN(1234).toString(),
          nonce: 0,
          deadline: expiration,
        });
      });

      it("reverts", async function () {
        await expectRevert(
          dollar.permit(user.address, owner.address, 1235, expiration, signature.v, signature.r, signature.s),
          "Permittable: Invalid signature",
        );
      });
    });
  });

  describe("transferFrom", function () {
    beforeEach(async function () {
      await dao.mintToE(owner.address, 100);
    });

    describe("amount equals approved", function () {
      let txRecp: ContractReceipt;
      beforeEach("transferFrom", async function () {
        await dollar.connect(owner).approve(user.address, 100);
        const tx = await dollar.connect(user).transferFrom(owner.address, user.address, 100);
        txRecp = await tx.wait();
      });

      it("decrements allowance", async function () {
        const allowance = await dollar.allowance(owner.address, user.address);
        expectBNEq(allowance, BN(0));
      });

      it("emits Transfer event", async function () {
        await expectEventIn(txRecp, "Transfer", {
          from: owner.address,
          to: user.address,
          value: BN(100),
        });
      });
    });

    describe("amount greater than approved", function () {
      beforeEach("transferFrom", async function () {
        await dollar.connect(owner).approve(user.address, 100);
      });

      it("emits Transfer event", async function () {
        await expectRevert(
          dollar.connect(user).transferFrom(owner.address, user.address, 101),
          "ERC20: transfer amount exceeds balance",
        );
      });
    });

    describe("approve unlimited", function () {
      let txRecp: ContractReceipt;
      beforeEach("transferFrom", async function () {
        await dollar.connect(owner).approve(user.address, ethers.constants.MaxUint256);
        const tx = await dollar.connect(user).transferFrom(owner.address, user.address, 100);
        txRecp = await tx.wait();
      });

      it("doesnt decrement allowance", async function () {
        const allowance = await dollar.allowance(owner.address, user.address);
        expectBNEq(allowance, ethers.constants.MaxUint256);
      });

      it("emits Transfer event", async function () {
        await expectEventIn(txRecp, "Transfer", {
          from: owner.address,
          to: user.address,
          value: BN(100),
        });
      });
    });
  });
});
