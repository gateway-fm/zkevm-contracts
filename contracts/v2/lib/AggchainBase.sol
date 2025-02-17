// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAggLayerGateway.sol";
import "../interfaces/IAggchainBase.sol";

/**
 * @title AggchainBase
 * @notice  Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract AggchainBase is PolygonConsensusBase, IAggchainBase {

    // Aggchain type that support generic aggchain hash
    uint32 public constant AGGCHAIN_TYPE = 1;
    // AggLayerGateway address, used in case the flag `useDefaultGateway` is set to true, the aggchains keys are managed by the gateway
    IAggLayerGateway public immutable aggLayerGateway;


    // Address that will be able to manage the aggchain verification keys and swap the useDefaultGateway flag.
    address public vKeyManager;
    // This account will be able to accept the vKeyManager role
    address public pendingVKeyManager;
    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of true, the keys are managed by the aggregation layer gateway
    bool public useDefaultGateway;

    // AggchainVKeys mapping
    mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey)
        public ownedAggchainVKeys;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token address.
     * @param _bridgeAddress Bridge address.
     * @param _rollupManager Rollup manager address.
     * @param _aggLayerGateway AggLayerGateway address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {
        aggLayerGateway = _aggLayerGateway;
    }

    /**
     * @notice Override the function to prevent the contract from being initialized with the initializer implemented at PolygonConsensusBase.
     */
    function initialize(
        address, // _admin
        address, // sequencer
        uint32, //networkID,
        address, // _gasTokenAddress,
        string memory, // sequencerURL,
        string memory // _networkName
    ) external pure override(PolygonConsensusBase) {
        // Set initialize variables
        revert InvalidInitializeFunction();
    }

    //////////////////
    // modifiers
    //////////////////
    // Modifier to check if the caller is the vKeyManager
    modifier onlyVKeyManager() {
        if (vKeyManager != msg.sender) {
            revert OnlyVKeyManager();
        }
        _;
    }

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Starts the vKeyManager role transfer
     * This is a two step process, the pending vKeyManager must accepted to finalize the process
     * @param newVKeyManager Address of the new pending admin
     */
    function transferVKeyManagerRole(
        address newVKeyManager
    ) external onlyVKeyManager {
        pendingVKeyManager = newVKeyManager;
        emit TransferVKeyManagerRole(newVKeyManager);
    }
    /**
     * @notice Allow the current pending vKeyManager to accept the vKeyManager role
     */
    function acceptVKeyManagerRole() external {
        if (pendingVKeyManager != msg.sender) {
            revert OnlyPendingVKeyManager();
        }
        vKeyManager = pendingVKeyManager;
        emit AcceptVKeyManagerRole(pendingVKeyManager);
    }
    /**
     * @notice Enable the use of the default gateway to manage the aggchain keys.
     */
    function enableUseDefaultGatewayFlag() external onlyVKeyManager {
        if (useDefaultGateway) {
            revert UseDefaultGatewayAlreadySet();
        }
        useDefaultGateway = true;
        // Emit event
        emit UpdateUseDefaultGatewayFlag(useDefaultGateway);
    }

    /**
     * @notice Disable the use of the default gateway to manage the aggchain keys. After disable, the keys are handled by the aggchain contract.
     */
    function disableUseDefaultGatewayFlag() external onlyVKeyManager {
        if (!useDefaultGateway) {
            revert UseDefaultGatewayAlreadySet();
        }
        useDefaultGateway = false;
        // Emit event
        emit UpdateUseDefaultGatewayFlag(useDefaultGateway);
    }

    /**
     * @notice Add a new aggchain verification key to the aggchain contract.
     * @param aggchainSelector The selector for the verification key query. This selector identifies the aggchain key
     * @param newAggchainVKey The new aggchain verification key to be added.
     */
    function addOwnedAggchainVKey(
        bytes4 aggchainSelector,
        bytes32 newAggchainVKey
    ) external onlyVKeyManager {
        if (newAggchainVKey == bytes32(0)) {
            revert InvalidAggchainVKey();
        }

        // Check already added
        if (ownedAggchainVKeys[aggchainSelector] != bytes32(0)) {
            revert OwnedAggchainVKeyAlreadyAdded();
        }
        ownedAggchainVKeys[aggchainSelector] = newAggchainVKey;
        emit AddAggchainVKey(aggchainSelector, newAggchainVKey);
    }

    /**
     * @notice Update the aggchain verification key in the aggchain contract.
     * @param aggchainSelector The selector for the verification key query. This selector identifies the aggchain key
     * @param updatedAggchainVKey The updated aggchain verification key value.
     */
    function updateOwnedAggchainVKey(
        bytes4 aggchainSelector,
        bytes32 updatedAggchainVKey
    ) external onlyVKeyManager {
        // Check already added
        if (ownedAggchainVKeys[aggchainSelector] == bytes32(0)) {
            revert OwnedAggchainVKeyNotFound();
        }
        ownedAggchainVKeys[aggchainSelector] = updatedAggchainVKey;
        emit UpdateAggchainVKey(aggchainSelector, updatedAggchainVKey);
    }

    /**
     * @notice returns the current aggchain verification key. If the flag `useDefaultGateway` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param aggchainSelector The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version
     */
    function getAggchainVKey(
        bytes4 aggchainSelector
    ) public view returns (bytes32 aggchainVKey) {
        if (useDefaultGateway == false) {
            aggchainVKey = ownedAggchainVKeys[aggchainSelector];
            if (aggchainVKey == bytes32(0)) {
                revert AggchainVKeyNotFound();
            }
        } else {
            // Retrieve aggchain key from AggLayerGateway
            aggchainVKey = aggLayerGateway.getDefaultAggchainVKey(
                aggchainSelector
            );
        }
    }

    /**
     * @notice Computes the selector for the aggchain verification key from the aggchain type and the aggchainVKeySelector.
     * @dev It joins two bytes2 values into a bytes4 value.
     * @param aggchainType The aggchain type, hardcoded in the aggchain contract.
     * @param aggchainVKeySelector The aggchain verification key selector, used to identify the aggchain verification key.
     */
    function _getAggchainSelectorFromType(
        bytes2 aggchainType,
        bytes2 aggchainVKeySelector
    ) internal pure returns (bytes4) {
        return bytes4(aggchainType) | (bytes4(aggchainVKeySelector) >> 16);
    }
}
