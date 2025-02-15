const ethers = require('ethers');

const AggchainType = {
    LEGACY: 0,
    GENERIC: 1,
};

function aggchainHashECDSAData(aggchainVKeySelector, newStateRoot) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes2', 'bytes32'],
        [aggchainVKeySelector, newStateRoot],
    );
}

function initializeECDSADataAfterUpgrade(useDefaultGateway, ownedAggchainVKeys, aggchainVkeySelector, vKeyManagerAddress) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'bytes32[]', 'bytes4[]', 'address'],
        [
            useDefaultGateway, // useDefaultGateway
            ownedAggchainVKeys, // ownedAggchainVKeys
            aggchainVkeySelector, // aggchainVkeySelector
            vKeyManagerAddress,
        ],
    );
}

function initializeECDSADataAfterDeploy(useDefaultGateway, ownedAggchainVKeys, aggchainVkeySelector, vKeyManagerAddress, adminAddress, trustedSequencerAddress, gasTokenAddress, trustedSequencerUrl, networkName) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
        ['bool', 'bytes32[]', 'bytes4[]', 'address', 'address', 'address', 'address', 'string', 'string'],
        [
            useDefaultGateway,
            ownedAggchainVKeys,
            aggchainVkeySelector,
            vKeyManagerAddress,
            adminAddress,
            trustedSequencerAddress,
            gasTokenAddress,
            trustedSequencerUrl,
            networkName,
        ],
    );
}
module.exports = {
    AggchainType,
    aggchainHashECDSAData,
    initializeECDSADataAfterUpgrade,
    initializeECDSADataAfterDeploy,
};
