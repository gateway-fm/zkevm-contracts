// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IALAggchainBaseEvents {
    /**
     * @dev Emitted when the admin updates the aggchain verification key
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);

    event UpdateAggchainVKey(
        bytes4 selector,
        bytes32 newAggchainVKey
    );

    event UpdateUseCustomChainGatewayFlag(bool useCustomChainGateway);
}

interface IALAggchainBaseErrors {
    error InvalidAggchainVKey();

    error AggchainRouteAlreadyAdded();

    error AggchainRouteNotFound();

    /**
     * @dev Thrown when trying to initialize the incorrect initialize function
     */
    error InvalidInitializeFunction();
}

interface IALAggchainBase is
    IALAggchainBaseErrors,
    IALAggchainBaseEvents
{
    function initialize(bytes calldata initializeBytesCustomChain) external;

    function getAggchainVKey(bytes4 selector) external returns (bytes32);
}
