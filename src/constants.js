const ethers = require('ethers');

/// /////////////////////////////////
///   TIMELOCK CONSTANTS   /////////
/// /////////////////////////////////
const TIMELOCK = {};
module.exports.TIMELOCK = TIMELOCK;
/*
 * Since roles are used, most storage is written in pseudoRandom storage slots
 * bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
 * bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
 * bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
 * bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
 * note: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L27
 */
TIMELOCK.ROLES = {
    TIMELOCK_ADMIN_ROLE: ethers.id('TIMELOCK_ADMIN_ROLE'),
    PROPOSER_ROLE: ethers.id('PROPOSER_ROLE'),
    EXECUTOR_ROLE: ethers.id('EXECUTOR_ROLE'),
    CANCELLER_ROLE: ethers.id('CANCELLER_ROLE'),
};

TIMELOCK.ROLES_HASH = [
    ethers.id('TIMELOCK_ADMIN_ROLE'),
    ethers.id('PROPOSER_ROLE'),
    ethers.id('EXECUTOR_ROLE'),
    ethers.id('CANCELLER_ROLE'),
];

/*
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L27
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L55
 */
TIMELOCK.ROLES_MAPPING_STORAGE_POS = 0;

// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L34
TIMELOCK.MINDELAY_STORAGE_POS = 2;

/// /////////////////////////////////
///   STORAGE CONSTANTS   //////////
/// /////////////////////////////////
module.exports.STORAGE_ONE_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000001';
module.exports.STORAGE_ZERO_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000000';
module.exports.NO_ADDRESS = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';