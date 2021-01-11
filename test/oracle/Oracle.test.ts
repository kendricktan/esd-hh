import { ethers } from "hardhat";
import {
  increaseTime,
  getLatestBlockTime,
  expectBNEq,
  expectBNAproxEq,
  expectRevert,
  BN,
} from "../Utils";

import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expect } from "chai";

const DECIMAL_DIFF = BN(10).pow(BN(12));
const EPSILON = BN(1).mul(DECIMAL_DIFF);

function cents(n) {
  return BN(n).mul(BN(10).pow(BN(16)));
}

function usdcDecimals(n) {
  return BN(n).mul(BN(10).pow(BN(6)));
}

function uint112s(time, priceNum = 1, priceDen = 1) {
  return BN(priceNum)
    .mul(BN(2).pow(BN(112)))
    .div(BN(priceDen))
    .div(DECIMAL_DIFF)
    .mul(BN(time));
}

async function priceForToBN(oracle) {
  return (await oracle.latestPrice()).value;
}

async function simulateTrade(amm, esd, usdc) {
  return await amm.simulateTrade(BN(esd).mul(BN(10).pow(BN(18))), BN(usdc).mul(BN(10).pow(BN(6))));
}

describe("Oracle", function () {
  let [owner, user]: SignerWithAddress[] = [];

  let MockOracle: ContractFactory;
  let MockUniswapV2PairTrade: ContractFactory;
  let MockUSDC: ContractFactory;
  let Dollar: ContractFactory;

  let dollar: Contract;
  let usdc: Contract;
  let amm: Contract;
  let oracle: Contract;

  before(async function () {
    [owner, user] = await ethers.getSigners();

    MockOracle = await ethers.getContractFactory("MockOracle");
    MockUniswapV2PairTrade = await ethers.getContractFactory("MockUniswapV2PairTrade");
    MockUSDC = await ethers.getContractFactory("MockUSDC");
    Dollar = await ethers.getContractFactory("Dollar");
  });

  beforeEach(async function () {
    dollar = await Dollar.connect(owner).deploy();
    usdc = await MockUSDC.connect(owner).deploy();
    amm = await MockUniswapV2PairTrade.connect(owner).deploy();
    oracle = await MockOracle.connect(owner).deploy(amm.address, dollar.address, usdc.address, {
      gasLimit: 8000000,
    });
    await increaseTime(3600);
  });

  describe("setup", function () {
    describe("not dao", function () {
      it("reverts", async function () {
        await expectRevert(oracle.connect(user).setup(), "Oracle: Not dao");
      });
    });
  });

  describe("step", function () {
    describe("not dao", function () {
      it("reverts", async function () {
        await expectRevert(oracle.connect(user).capture(), "Oracle: Not dao");
      });
    });

    describe("after advance without trade", function () {
      beforeEach(async function () {
        await oracle.connect(owner).capture();
      });

      it("is uninitialized", async function () {
        expectBNEq(await priceForToBN(oracle), cents(100));
        expect(await oracle.isInitialized()).to.be.equal(false);
        expectBNEq(await oracle.cumulative(), BN(0));
        expectBNEq(await oracle.timestamp(), BN(0));
        expectBNEq(await oracle.reserve(), BN(0));
      });
    });

    describe("after advance with trade", function () {
      describe("price of 1", function () {
        describe("same block", function () {
          let timestamp: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), BN(0));
            expectBNAproxEq(await oracle.timestamp(), BN(timestamp), BN(10));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });

        describe("long before", function () {
          let timestamp: number;
          beforeEach(async function () {
            timestamp = await getLatestBlockTime();
            await simulateTrade(amm, 1000000, 1000000);
            await increaseTime(3600);
            await oracle.connect(owner).capture();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), BN(0));
            expectBNEq(await oracle.timestamp(), BN(timestamp + 3600))
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });
      });

      describe("price greater than 1", function () {
        describe("same block", function () {
          let timestamp: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1100000, 1000000);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), BN(0));
            expectBNAproxEq(await oracle.timestamp(), BN(timestamp), BN(10));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });

        describe("long before", function () {
          let timestamp: number;
          beforeEach(async function () {
            timestamp = await getLatestBlockTime();
            await simulateTrade(amm, 1100000, 1000000);
            await increaseTime(3600);
            await oracle.connect(owner).capture();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), BN(0));
            expectBNEq(await oracle.timestamp(), BN(timestamp + 3600));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });
      });
    });

    describe("after multiple advances with trade", function () {
      describe("price of 1", function () {
        describe("same block", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;

          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            initialized = await getLatestBlockTime();
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(100), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });

        describe("long before", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(100), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });
      });

      describe("price greater than 1", function () {
        describe("same block", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1100000);
            initialized = await getLatestBlockTime();
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(110), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1100000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1100000));
          });
        });

        describe("long before", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1100000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(110), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1100000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1100000));
          });
        });
      });
    });

    describe("after advance with multiple trades", function () {
      describe("price of 1", function () {
        describe("same block", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1000000);
            timestamp = await getLatestBlockTime();
            await oracle.connect(owner).capture();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });

        describe("long before", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1000000);
            timestamp = await getLatestBlockTime();
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });
      });

      describe("price greater than 1", function () {
        describe("same block", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1100000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1100000);
            timestamp = await getLatestBlockTime();
            await oracle.connect(owner).capture();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1100000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1100000));
          });
        });

        describe("long before", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1100000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1100000);
            timestamp = await getLatestBlockTime();
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1100000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1100000));
          });
        });

        describe("different prices", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1150000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1050000);
            timestamp = await getLatestBlockTime();
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNEq(await priceForToBN(oracle), cents(100));
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1150000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1050000));
          });
        });
      });
    });

    describe("after multiple advances with multiple trades", function () {
      describe("price of 1", function () {
        describe("same block", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1000000);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(100), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });

        describe("long before", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1000000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1000000);
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(100), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1000000));
          });
        });
      });

      describe("price greater than 1", function () {
        describe("same block", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1100000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1100000);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(110), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1100000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1100000));
          });
        });

        describe("long before", function () {
          let initialized: number;
          let timestamp: number;
          let timediff: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1100000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1100000);
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
            timediff = BN(timestamp).sub(initialized).toNumber();
          });

          it("is initialized", async function () {
            expectBNAproxEq(await priceForToBN(oracle), cents(110), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), uint112s(timediff, 1100000, 1000000));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1100000));
          });
        });

        describe("different prices", function () {
          let initialized: number;
          let timestamp: number;
          let middle: number;
          beforeEach(async function () {
            await simulateTrade(amm, 1000000, 1150000);
            initialized = await getLatestBlockTime();
            await increaseTime(3600);
            await simulateTrade(amm, 1000000, 1050000);
            middle = await getLatestBlockTime();
            await increaseTime(3600);
            await oracle.connect(owner).capture();
            await increaseTime(86400);
            await oracle.connect(owner).capture();
            timestamp = await getLatestBlockTime();
          });

          it("is initialized", async function () {
            const begin = uint112s(BN(middle).sub(initialized).toNumber(), 1150000, 1000000);
            const end = uint112s(BN(timestamp).sub(middle).toNumber(), 1050000, 1000000);

            expectBNAproxEq(await priceForToBN(oracle), cents(105), EPSILON);
            expect(await oracle.isInitialized()).to.be.equal(true);
            expectBNEq(await oracle.cumulative(), begin.add(end));
            expectBNEq(await oracle.timestamp(), BN(timestamp));
            expectBNEq(await oracle.reserve(), usdcDecimals(1050000));
          });
        });
      });
    });

    describe("after many advances", function () {
      describe("different prices", function () {
        let timestamp: number;
        beforeEach(async function () {
          await simulateTrade(amm, 1000000, 1150000);
          await increaseTime(3600);
          await oracle.connect(owner).capture();
          await increaseTime(86400 - 3600);
          await simulateTrade(amm, 1000000, 1050000);
          await increaseTime(3600);
          await oracle.connect(owner).capture();
          await increaseTime(3600);
          await simulateTrade(amm, 1000000, 950000);
          await increaseTime(86400 - 3600);
          await oracle.connect(owner).capture();
          await increaseTime(3600);
          await simulateTrade(amm, 1000000, 950000);
          await increaseTime(86400 - 3600);
          await oracle.connect(owner).capture();
          timestamp = await getLatestBlockTime();
        });

        it("is initialized", async function () {
          expectBNAproxEq(await priceForToBN(oracle), cents(95), EPSILON);
          expect(await oracle.isInitialized()).to.be.equal(true);
          expectBNEq(await oracle.timestamp(), BN(timestamp));
          expectBNEq(await oracle.reserve(), usdcDecimals(950000));
        });
      });
    });

    describe("current reserve too low", function () {
      describe("long before", function () {
        let initialized: number;
        let timestamp: number;
        let timediff: number;
        beforeEach(async function () {
          await simulateTrade(amm, 250000, 300000);
          initialized = await getLatestBlockTime();
          await increaseTime(3600);
          await oracle.connect(owner).capture();
          await increaseTime(86400);
          await simulateTrade(amm, 2500, 3000);
          await oracle.connect(owner).capture();
          timestamp = await getLatestBlockTime();
          timediff = BN(timestamp).sub(initialized).toNumber();
        });

        it("is initialized", async function () {
          expectBNAproxEq(await priceForToBN(oracle), cents(120), EPSILON);
          expect(await oracle.latestValid()).to.be.equal(false);
          expect(await oracle.isInitialized()).to.be.equal(true);
          expectBNEq(await oracle.cumulative(), uint112s(timediff, 3000, 2500));
          expectBNEq(await oracle.timestamp(), BN(timestamp));
          expectBNEq(await oracle.reserve(), usdcDecimals(3000));
        });
      });
    });

    describe("previous reserve too low", function () {
      describe("long before", function () {
        let initialized: number;
        let timestamp: number;
        let timediff: number;
        beforeEach(async function () {
          await simulateTrade(amm, 2500, 3000);
          initialized = await getLatestBlockTime();
          await increaseTime(3600);
          await oracle.connect(owner).capture();
          await increaseTime(86400);
          await simulateTrade(amm, 250000, 300000);
          await oracle.connect(owner).capture();
          timestamp = await getLatestBlockTime();
          timediff = BN(timestamp).sub(initialized).toNumber();
        });

        it("is initialized", async function () {
          expectBNAproxEq(await priceForToBN(oracle), cents(120), EPSILON);
          expect(await oracle.latestValid()).to.be.equal(false);
          expect(await oracle.isInitialized()).to.be.equal(true);
          expectBNEq(await oracle.cumulative(), uint112s(timediff, 3000, 2500));
          expectBNEq(await oracle.timestamp(), BN(timestamp));
          expectBNEq(await oracle.reserve(), usdcDecimals(300000));
        });
      });
    });

    describe("both reserve too low", function () {
      describe("long before", function () {
        let initialized: number;
        let timestamp: number;
        let timediff: number;
        beforeEach(async function () {
          await simulateTrade(amm, 2500, 3000);
          initialized = await getLatestBlockTime();
          await increaseTime(3600);
          await oracle.connect(owner).capture();
          await increaseTime(86400);
          await oracle.connect(owner).capture();
          timestamp = await getLatestBlockTime();
          timediff = BN(timestamp).sub(initialized).toNumber();
        });

        it("is initialized", async function () {
          expectBNAproxEq(await priceForToBN(oracle), cents(120), EPSILON);
          expect(await oracle.latestValid()).to.be.equal(false);
          expect(await oracle.isInitialized()).to.be.equal(true);
          expectBNEq(await oracle.cumulative(), uint112s(timediff, 3000, 2500));
          expectBNEq(await oracle.timestamp(), BN(timestamp));
          expectBNEq(await oracle.reserve(), usdcDecimals(3000));
        });
      });
    });

    describe("usdc blacklisted", function () {
      describe("long before", function () {
        let initialized: number;
        let timestamp: number;
        let timediff: number;
        beforeEach(async function () {
          await simulateTrade(amm, 100000, 100000);
          initialized = await getLatestBlockTime();
          await increaseTime(3600);
          await oracle.connect(owner).capture();
          await increaseTime(86400);
          await usdc.setIsBlacklisted(true);
          await oracle.connect(owner).capture();
          timestamp = await getLatestBlockTime();
          timediff = BN(timestamp).sub(initialized).toNumber();
        });

        it("is initialized", async function () {
          expectBNAproxEq(await priceForToBN(oracle), cents(100), EPSILON);
          expect(await oracle.latestValid()).to.be.equal(false);
          expect(await oracle.isInitialized()).to.be.equal(true);
          expectBNEq(await oracle.cumulative(), uint112s(timediff));
          expectBNEq(await oracle.timestamp(), BN(timestamp));
          expectBNEq(await oracle.reserve(), usdcDecimals(100000));
        });
      });
    });
  });

  describe("pair", function () {
    it("is returns pair", async function () {
      expect(await oracle.pair()).to.be.equal(amm.address);
    });
  });
});
