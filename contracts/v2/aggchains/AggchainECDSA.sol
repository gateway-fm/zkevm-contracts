// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../interfaces/IALAggchain.sol";
import "../lib/AggchainBase.sol";

/**
 * @title AggchainECDSA
 * @notice Generic aggchain based on ECDSA signature.
 * An address signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree & nullifier_tree).
 * That address is the trustedSequencer and is set during the chain initialization.
 */
contract AggchainECDSA is AggchainBase, IALAggchain {
    /**
     * @dev Emitted when Pessimistic proof is verified.
     */
    event OnVerifyPessimistic();

    /**
     * @param _rollupManager Rollup manager address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
        )
    {}

    /**
     * @param initializeBytesCustomChain Encoded params to initialize the chain.
     * Each aggchain has its decoded params.
     */
    function initialize(
        bytes memory initializeBytesCustomChain
    ) external override onlyRollupManager initializer {
        // custom parsing of the initializeBytesCustomChain
        // TODO: add all metadata params
        (
            uint32 _networkID,
            string memory _networkName,
            address _admin,
            address _trustedSequencer
        ) = abi.decode(
                initializeBytesCustomChain,
                (uint32, string, address, address)
            );

        // set chain variables
        networkID = _networkID;
        networkName = _networkName;
        admin = _admin;
        trustedSequencer = _trustedSequencer;
    }

    /**
     * @dev Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | aggchainVKey   | aggchainConfig |
     * length (bits):   |       256           | 256       |
     * aggchainConfig = keccak256(abi.encodePacked(trusted_sequencer))
     */
    /// @inheritdoc IALAggchain
    function getAggchainHash(
        bytes memory customChainData
    ) external view returns (bytes32) {
        bytes4 aggchainSelector = abi.decode(customChainData, (bytes4));
        return
            keccak256(
                abi.encodePacked(
                    getAggchainVKey(aggchainSelector),
                    keccak256(abi.encodePacked(trustedSequencer))
                )
            );
    }

    /**
     * @notice For ECDSA chains, a plain event is emitted after pessimistic verification
     * @dev The customData is not used at this kind of chain, added to match the interface
     */
    function onVerifyPessimistic(
        bytes memory // customData
    ) external onlyRollupManager {
        // just throw an event
        emit OnVerifyPessimistic();
    }
}
