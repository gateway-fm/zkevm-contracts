/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const AGGCHAIN_TYPE = 1;
// aggchain type selector for FEP
const AGGCHAIN_TYPE_SELECTOR_FEP = "0x0001";

/**
 * Function to encode the initialize bytes for the custom chain (version 0 --> initializerVersion = 0)
 * @param {String} admin Admin address
 * @param {String} trustedSequencer Trusted sequencer address
 * @param {String} gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
 * @param {String} trustedSequencerURL Trusted sequencer URL
 * @param {String} networkName L2 network name
 * @param {String} aggregationVkey Aggregation Vkey
 * @param {String} chainConfigHash Chain config hash
 * @param {String} rangeVkeyCommitment Range Vkey commitment
 * @param {String} initStateRoot Initial state root
 * @param {Number} initTimestamp Initial timestamp
 * @param {Number} initL2BlockNumber Initial L2 block number
 * @param {String} vKeyManager vkey manager address
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesCustomChainFEPv0(
    admin,
    trustedSequencer,
    gasTokenAddress,
    trustedSequencerURL,
    networkName,
    aggregationVkey,
    chainConfigHash,
    rangeVkeyCommitment,
    initStateRoot,
    initTimestamp,
    initL2BlockNumber,
    vKeyManager
){
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address', 'string', 'string', 'bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint128', 'uint128', 'address'],
        [
            admin,
            trustedSequencer,
            gasTokenAddress,
            trustedSequencerURL,
            networkName,
            aggregationVkey,
            chainConfigHash,
            rangeVkeyCommitment,
            initStateRoot,
            initTimestamp,
            initL2BlockNumber,
            vKeyManager
        ],
    );
}

/**
 * Function to encode the initialize bytes for the custom chain (version 1 --> initializerVersion = 1)
 * @param {String} aggregationVkey aggregation Vkey
 * @param {String} chainConfigHash chain config hash
 * @param {String} rangeVkeyCommitment range Vkey commitment
 * @param {String} initStateRoot initial state root
 * @param {Number} initTimestamp initial timestamp
 * @param {Number} initL2BlockNumber initial L2 block number
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesCustomChainFEPv1(
    aggregationVkey,
    chainConfigHash,
    rangeVkeyCommitment,
    initStateRoot,
    initTimestamp,
    initL2BlockNumber
){
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint128', 'uint128'],
        [
            aggregationVkey,
            chainConfigHash,
            rangeVkeyCommitment,
            initStateRoot,
            initTimestamp,
            initL2BlockNumber
        ],
    );
}

/**
 * Function to encode the custom chain data
 * @param {String} aggchainSelector aggchain selector
 * @param {String} newStateRoot new state root
 * @returns {String} encoded value in hexadecimal string
 */
function encodeCustomChainDataFEP(aggchainSelector, l1Head, l2PreRoot, claimRoot, claimBlockNum) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes2', 'bytes32', 'bytes32', 'bytes32', 'uint256'], [aggchainSelector, l1Head, l2PreRoot, claimRoot, claimBlockNum]);
}

/**
 *  Function to encode the aggchain config for ECDSA
 * @param {String} l1Head
 * @param {String} l2PreRoot
 * @param {String} claimRoot
 * @param {Number} claimBlockNum
 * @param {String} chainConfigHash
 * @param {String} rangeVkeyCommitment
 * @param {String} aggregationVkey
 * @returns {String} hash of encoded value in hexadecimal string (32 bytes)
 */
function aggchainConfigFEP(l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32', 'bytes32'], [l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey])
}

/**
 * Function to get the final aggchain selector for ECDSA
 * @param {String} aggchainSelector aggchain selector
 * @returns {String} encoded value in hexadecimal string (4 bytes) AGGCHAIN_TYPE_SELECTOR_ECDSA (2 bytes) | aggchainSelector (2 bytes)
 */
function getFinalAggchainSelectorFEP(aggchainSelector) {
    return AGGCHAIN_TYPE_SELECTOR_FEP.concat(Scalar.e(aggchainSelector).toString(16).padStart(4, '0'));
}

/**
 * Function to get the aggchain hash
 * @param {String} aggchainVKey aggchain vkey
 * @param {String} aggchainConfig aggchain config FEP
 * @returns {String} hash of encoded value in hexadecimal string (32 bytes)
 */
function getAggchainHashFEP(aggchainVKey, aggchainConfig) {
    return ethers.solidityPackedKeccak256(['uint32', 'bytes32', 'bytes32'], [AGGCHAIN_TYPE, aggchainVKey, aggchainConfig]);
}

/**
 * Function to encode the custom initialize data
 * @param {String} aggregationVkey aggregation Vkey
 * @param {String} chainConfigHash chain config hash
 * @param {String} rangeVkeyCommitment range Vkey commitment
 * @returns {String} encoded value in hexadecimal string
 */
function encodeCustomInitializeDataFEP(aggregationVkey, chainConfigHash, rangeVkeyCommitment) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32'],
        [
            aggregationVkey,
            chainConfigHash,
            rangeVkeyCommitment,
        ]
    );
}

module.exports = {
    AGGCHAIN_TYPE,
    AGGCHAIN_TYPE_SELECTOR_FEP,
    encodeInitializeBytesCustomChainFEPv0,
    encodeInitializeBytesCustomChainFEPv1,
    encodeCustomChainDataFEP,
    aggchainConfigFEP,
    getFinalAggchainSelectorFEP,
    getAggchainHashFEP,
    encodeCustomInitializeDataFEP
};
