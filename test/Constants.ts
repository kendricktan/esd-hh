import { BN } from "./Utils";

export const FROZEN = BN(0);
export const FLUID = BN(1);
export const LOCKED = BN(2);

export const INITIAL_STAKE_MULTIPLE = BN(10).pow(BN(6)); // 100 ESD -> 100M ESDS

export const BOOTSTRAPPING_PERIOD = 90;

export const VOTE_PERIOD = BN(9);
export const EXPIRATION = BN(3);
export const EMERGENCY_COMMIT_PERIOD = BN(6);

export const UNDECIDED = BN(0);
export const APPROVE = BN(1);
export const REJECT = BN(2);

export const TREASURY_ADDRESS = "0x460661bd4A5364A3ABCc9cfc4a8cE7038d05Ea22";
export const POOL_REWARD_PERCENT = BN(20);
export const TREASURY_REWARD_BIPS = BN(250);
