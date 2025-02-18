/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');
const { Scalar } = require('ffjavascript');

const AGGCHAIN_TYPE = 1;
// aggchain type selector for ECDSA
const AGGCHAIN_TYPE_SELECTOR_ECDSA = '0x0000';

/**
 * Function to encode the initialize bytes for the custom chain (version 0 --> initializerVersion = 0)
 * @param {String} useDefaultGateway Indicates if the default gateway is used
 * @param {String} ownedAggchainVKey Owned aggchain vkey
 * @param {String} aggchainVKeySelectors Aggchain vkey selectors
 * @param {String} vKeyManager vkey manager address
 * @param {String} admin Admin address
 * @param {String} trustedSequencer Trusted sequencer address
 * @param {String} gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
 * @param {String} trustedSequencerURL Trusted sequencer URL
 * @param {String} networkName L2 network name
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesCustomChainECDSAv0(
    useDefaultGateway,
    ownedAggchainVKey,
    aggchainVKeySelectors,
    vKeyManager,
    admin,
    trustedSequencer,
    gasTokenAddress,
    trustedSequencerURL,
    networkName,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'bytes32[]', 'bytes4[]', 'address', 'address', 'address', 'address', 'string', 'string'],
        [
            useDefaultGateway,
            ownedAggchainVKey,
            aggchainVKeySelectors,
            vKeyManager,
            admin,
            trustedSequencer,
            gasTokenAddress,
            trustedSequencerURL,
            networkName,
        ],
    );
}

/**
 * Function to encode the initialize bytes for the custom chain (version 0 --> initializerVersion = 0)
 * @param {String} useDefaultGateway Indicates if the default gateway is used
 * @param {String} ownedAggchainVKey Owned aggchain vkey
 * @param {String} aggchainVKeySelectors Aggchain vkey selectors
 * @param {String} vKeyManager vkey manager address
 * @returns {String} encoded value in hexadecimal string
 */
function encodeInitializeBytesCustomChainECDSAv1(
    useDefaultGateway,
    ownedAggchainVKey,
    aggchainVKeySelectors,
    vKeyManager,
) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'bytes32[]', 'bytes4[]', 'address'],
        [
            useDefaultGateway,
            ownedAggchainVKey,
            aggchainVKeySelectors,
            vKeyManager,
        ],
    );
}

/**
 * Function to encode the custom chain data
 * @param {String} aggchainSelector aggchain selector
 * @param {String} newStateRoot new state root
 * @returns {String} encoded value in hexadecimal string
 */
function encodeCustomChainDataECDSA(aggchainSelector, newStateRoot) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes2', 'bytes32'], [aggchainSelector, newStateRoot]);
}

/**
 *  Function to encode the aggchain config for ECDSA
 * @param {String} trustedSequencer Trusted sequencer address
 * @returns {String} hash of encoded value in hexadecimal string (32 bytes)
 */
function aggchainConfigECDSA(trustedSequencer) {
    return ethers.solidityPackedKeccak256(['address'], [trustedSequencer]);
}

/**
 * Function to get the final aggchain selector for ECDSA
 * @param {String} aggchainSelector aggchain selector
 * @returns {String} encoded value in hexadecimal string (4 bytes) AGGCHAIN_TYPE_SELECTOR_ECDSA (2 bytes) | aggchainSelector (2 bytes)
 */
function getFinalAggchainSelectorECDSA(aggchainSelector) {
    return `0x${Scalar.e(aggchainSelector).toString(16).padStart(4, '0')}${AGGCHAIN_TYPE_SELECTOR_ECDSA.slice(2)}`;
}

/**
 * Function to get the aggchain hash
 * @param {String} aggchainVKey aggchain vkey
 * @param {String} aggchainConfig aggchain config ECDSA
 * @returns {String} hash of encoded value in hexadecimal string (32 bytes)
 */
function getAggchainHashECDSA(aggchainVKey, aggchainConfig) {
    return ethers.solidityPackedKeccak256(['uint32', 'bytes32', 'bytes32'], [AGGCHAIN_TYPE, aggchainVKey, aggchainConfig]);
}

module.exports = {
    AGGCHAIN_TYPE,
    AGGCHAIN_TYPE_SELECTOR_ECDSA,
    encodeInitializeBytesCustomChainECDSAv0,
    encodeInitializeBytesCustomChainECDSAv1,
    encodeCustomChainDataECDSA,
    aggchainConfigECDSA,
    getFinalAggchainSelectorECDSA,
    getAggchainHashECDSA,

};
