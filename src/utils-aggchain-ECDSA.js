/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const AGGCHAIN_TYPE = 1;
const AGGCHAIN_TYPE_SELECTOR_ECDSA = "0x0000";

function encodeInitializeBytesCustomChain(
    admin,
    trustedSequencer,
    gasTokenAddress,
    trustedSequencerURL,
    networkName,
    vKeyManager,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address', 'string', 'string', 'address'],
        [
            admin,
            trustedSequencer,
            gasTokenAddress,
            trustedSequencerURL,
            networkName,
            vKeyManager
        ],
    );
}

function encodeCustomChainData(aggchainSelector, newStateRoot) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes2', 'bytes32'], [aggchainSelector, newStateRoot]);
}

function aggchainConfig(trustedSequencer) {
    return  ethers.solidityPackedKeccak256(['address'], [trustedSequencer]);
}

function getFinalAggchainSelector(aggchainSelector) {
    return AGGCHAIN_TYPE_SELECTOR_ECDSA + Scalar.e(aggchainSelector).toString(16).padStart(4, '0');
}

function getAggchainHash(aggchainVKey, aggchainConfig) {
    return ethers.solidityPackedKeccak256(['uint32', 'bytes32', 'bytes32'], [AGGCHAIN_TYPE, aggchainVKey, aggchainConfig]);
}


module.exports = {
    AGGCHAIN_TYPE,
    AGGCHAIN_TYPE_SELECTOR_ECDSA,
    encodeInitializeBytesCustomChain,
    encodeCustomChainData,
    aggchainConfig,
    getFinalAggchainSelector,
    getAggchainHash

};
