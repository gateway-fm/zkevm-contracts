/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const AGGCHAIN_TYPE = 1;
const AGGCHAIN_TYPE_SELECTOR_FEP = "0x0001";

function encodeInitializeBytesCustomChainv0(
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

function encodeInitializeBytesCustomChainv1(
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

function encodeCustomChainData(aggchainSelector, l1Head, l2PreRoot, claimRoot, claimBlockNum) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes2', 'bytes32', 'bytes32', 'bytes32', 'uint256'], [aggchainSelector, l1Head, l2PreRoot, claimRoot, claimBlockNum]);
}

function aggchainConfig(l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32', 'bytes32'], [l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey])
}

function getFinalAggchainSelector(aggchainSelector) {
    return AGGCHAIN_TYPE_SELECTOR_FEP.concat(Scalar.e(aggchainSelector).toString(16).padStart(4, '0'));
}

function getAggchainHash(aggchainVKey, aggchainConfig) {
    return ethers.solidityPackedKeccak256(['uint32', 'bytes32', 'bytes32'], [AGGCHAIN_TYPE, aggchainVKey, aggchainConfig]);
}

function encodeCustomInitializeData(aggregationVkey, chainConfigHash, rangeVkeyCommitment) {
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
    encodeInitializeBytesCustomChainv0,
    encodeInitializeBytesCustomChainv1,
    encodeCustomChainData,
    aggchainConfig,
    getFinalAggchainSelector,
    getAggchainHash,
    encodeCustomInitializeData
};
