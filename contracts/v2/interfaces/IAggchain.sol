// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

/**
 * @title IAggchain
 * @notice Minimum interface that any generic aggchain implementation needs to implement to fit in the aggregation layer logic.
 */
interface IAggchain {
    /**
     * @notice Gets aggchain hash.
     * @dev Each chain should properly manage its own aggchain hash.
     * @param customChainData Custom chain data to build the consensus hash.
     */
    function getAggchainHash(
        bytes calldata customChainData
    ) external view returns (bytes32);

    /**
     * @notice Callback from the PolygonRollupManager to update the chain's state.
     * @dev Each chain should properly manage its own state.
     * @param data Custom chain data to update chain's state
     */
    function onVerifyPessimistic(bytes calldata data) external;

    /**
     * @notice Initialize function of the aggchain where initial values are set.
     * @param initializeBytesCustomChain Encoded initialize params for the aggchain.
     */
    function initialize(bytes calldata initializeBytesCustomChain) external;
}
