// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IALAggchainBase.sol";
import "./PolygonConsensusBase.sol";
import "../AggLayerGateway.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract ALAggchainBase is
    PolygonConsensusBase,
    IALAggchainBase
{
    struct AggchainRoute {
        bytes plonkVKey;
        bytes32 aggchainVKey;
        bool frozen;
    }

    // Consensus type that support generic consensus
    uint32 public constant AGGCHAIN_TYPE = 1;

    // Network/Rollup identifier
    uint32 public networkID;

    // Chain identifier
    uint64 public chainID;

    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of false (default), the keys are managed by the aggregation layer gateway
    bool public useCustomChainGateway;

    AggLayerGateway public immutable aggLayerGateway;

    // aggchainVKeys mapping
    mapping(bytes4 => AggchainRoute) public aggchainRoutes;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        AggLayerGateway _aggLayerGateway
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
     * @notice Override the function to prevent the contract from being initialized with this initializer implemented at PolygonConsensusBase.
     * @dev The function modifiers and initializer found in the original function have been removed for bytecode optimizations.
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
    // admin functions
    //////////////////

    function switchCustomChainGatewayFlag() external onlyAdmin {
        useCustomChainGateway = !useCustomChainGateway;
        // Emit event
        emit UpdateUseCustomChainGatewayFlag(useCustomChainGateway);
    }

    function addAggchainRoute(
        bytes4 selector,
        bytes32 aggchainVKey,
        bytes calldata plonkVKey
    ) external onlyAdmin {
        if (aggchainVKey == bytes32(0)) {
            revert InvalidAggchainVKey();
        }
        AggchainRoute storage aggchainRoute = aggchainRoutes[selector];
        // Check already added
        if (aggchainRoute.aggchainVKey != bytes32(0)) {
            revert AggchainRouteAlreadyAdded();
        }
        aggchainRoute.aggchainVKey = aggchainVKey;
        aggchainRoute.plonkVKey = plonkVKey;
        emit AddAggchainVKey(selector, aggchainVKey);
    }

    function updateAggchainRoute(
        bytes4 selector,
        bytes32 updatedAggchainVKey,
        bytes calldata updatedPlonkVKey
    ) external onlyAdmin {
        AggchainRoute storage aggchainRoute = aggchainRoutes[selector];
        // Check already added
        if (aggchainRoute.aggchainVKey != bytes32(0)) {
            revert AggchainRouteNotFound();
        }
        aggchainRoute.aggchainVKey = updatedAggchainVKey;
        aggchainRoute.plonkVKey = updatedPlonkVKey;
        emit UpdateAggchainVKey(selector, updatedAggchainVKey);
    }

    /**
     * @notice returns the current aggchain verification key. If the flag `useCustomChainGateway` is set to false, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param selector The selector for the verification key query
     */
    function _getAggchainVKey(
        bytes4 selector
    ) internal view returns (bytes32) {
        if (useCustomChainGateway) {
            return aggchainRoutes[selector].aggchainVKey;
        }
        // Retrieve aggchain key from AggLayerGateway
        return aggLayerGateway.getAggchainVKey(selector);
    }

}
