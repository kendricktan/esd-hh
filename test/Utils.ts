import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, ContractReceipt } from "ethers";
import { Result } from "ethers/lib/utils";

const { provider } = ethers;

export const mine = async (): Promise<void> => {
  await provider.send("evm_mine", []);
};

export const increaseTime = async (ms: number): Promise<void> => {
  await provider.send("evm_increaseTime", [ms]);
};

export const getLatestBlockTime = async (): Promise<number> => {
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);

  return block.timestamp;
};

export const expectBNEq = (a: BigNumber, b: BigNumber): void => {
  if (!ethers.BigNumber.isBigNumber(a)) {
    expect(BN(a).eq(b)).to.be.equal(true, `${BN(a).toString()} is not equal to ${b.toString()}`);
  } else {
    expect(a.eq(b)).to.be.equal(true, `${a.toString()} is not equal to ${b.toString()}`);
  }
};

export const expectBNAproxEq = (a: BigNumber, b: BigNumber, delta: BigNumber): void => {
  const smallest = b.sub(delta);
  const biggest = b.add(delta);

  expect(a.gte(smallest) && a.lte(biggest)).to.be.equal(
    true,
    `${a.toString()} is not within ${delta.toString()} units from ${b.toString()}`,
  );
};

export const BN = (a: number | string): BigNumber => {
  return ethers.BigNumber.from(a);
};

export const expectEventIn = (txRecp: ContractReceipt, eventName: string, eventArgs: any): void => {
  const foundEvents: Result[] = [];

  for (const { event, args } of txRecp.events || []) {
    if (event === eventName && args) {
      foundEvents.push(Object.entries(args));

      let sameArgs = true;

      for (const [k, v] of Object.entries(eventArgs)) {
        if (ethers.BigNumber.isBigNumber(v)) {
          sameArgs = v.eq(args[k]) && sameArgs;
        } else {
          sameArgs = args[k] === v && sameArgs;
        }
      }

      if (sameArgs) {
        return;
      }
    }
  }

  expect.fail(
    `Event ${eventName} not found with ${JSON.stringify(eventArgs)}, instead found ${JSON.stringify(foundEvents)}`,
  );
};

export const expectRevert = async (promise: Promise<any>, expectedError: String) => {
  // eslint-disable-next-line
  promise.catch(() => {}); // Catch all exceptions

  try {
    await promise;
  } catch (error) {
    if (error.message.indexOf(expectedError) === -1) {
      // When the exception was a revert, the resulting string will include only
      // the revert reason, otherwise it will be the type of exception (e.g. 'invalid opcode')
      const actualError = error.message.replace(
        /Returned error: VM Exception while processing transaction: (revert )?/,
        "",
      );
      expect(actualError).to.equal(expectedError, "Wrong kind of exception received");
    }
    return;
  }

  expect.fail("Expected an exception but none was received");
};
