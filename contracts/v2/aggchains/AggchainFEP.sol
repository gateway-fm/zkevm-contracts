// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../lib/ALAggchainBase.sol";
import "../interfaces/IALAggchain.sol";
import "../AggLayerGateway.sol";

/*
 * Generic aggchain based on full execution proof that relies on op-succinct stack.
 * op-succinct (more concretely op-proposer) will build the state transition proof (op-fep).
 * This proof, along with bridge checks, constitutes the final FEP proof.
 */
contract AggchainFEP is ALAggchainFEPBase, IALAggchainFEP {
    // op-stack parameters
    bytes32 public aggregationVkey;
    bytes32 public chainConfigHash;
    bytes32 public rangeVkeyCommitment;

    struct ChainData {
        bytes32 lastStateRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    ChainData[] public chainData;

    //////////
    // Events
    /////////

    /**
     * @dev Emitted when Pessimistic proof is verified
     */
    event OnVerifyPessimistic(
        bytes32 initStateRoot,
        uint128 initTimestamp,
        uint128 initL2BlockNumber
    );

    /**
     * @param _rollupManager TODO
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        AggLayerGateway _aggLayerGateway
    )
        ALAggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
        )
    {}
    /**
     * @param initializeBytesCustomChain  Encoded params to initialize the chain. Each aggchain has its decoded params
     */
    function initialize(
        bytes memory initializeBytesCustomChain
    ) external override onlyRollupManager initializer {
        // custom parsing of the initializeBytesCustomChain
        (
            uint32 _networkID,
            string memory _networkName,
            address _admin,
            bytes32 _aggregationVkey,
            bytes32 _chainConfigHash,
            bytes32 _rangeVkeyCommitment,
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber
        ) = abi.decode(
                initializeBytesCustomChain,
                (
                    uint32,
                    string,
                    address,
                    bytes32,
                    bytes32,
                    bytes32,
                    bytes32,
                    uint128,
                    uint128
                )
            );

        // set chain variables
        networkID = _networkID;
        networkName = _networkName;
        admin = _admin;
        aggregationVkey = _aggregationVkey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
        // storage chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );
    }

    /**
     * Note Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainConfig |
     * length (bits):   |    32     |       256           | 256       |
     * uint256 aggchain_config = keccak256(abi.encodePacked(l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey))
     * @param customChainData TODO
     */
    function getAggchainHash(
        bytes memory customChainData
    ) external view returns (bytes32) {
        (
            bytes4 selector,
            bytes32 l1Head,
            bytes32 l2PreRoot,
            bytes32 claimRoot,
            uint256 claimBlockNum
        ) = abi.decode(
                customChainData,
                (bytes4, bytes32, bytes32, bytes32, uint256)
            );
        bytes32 aggchainConfig = keccak256(
            abi.encodePacked(
                l1Head,
                l2PreRoot,
                claimRoot,
                claimBlockNum,
                chainConfigHash,
                rangeVkeyCommitment,
                aggregationVkey
            )
        );

        return
            keccak256(
                abi.encodePacked(
                    AGGCHAIN_TYPE,
                    _getAggchainVKey(selector),
                    aggchainConfig
                )
            );
    }

    function getAggchainVKey(
        bytes4 selector
    ) external view returns (bytes32) {
        return _getAggchainVKey(selector);
    }

    /**
     * Note set the verification key of a zkVM program used to verify the execution-proof
     * TODO: add a timelock delay to avoid invalidate proofs
     * TODO: Same for trusted sequencer
     */
    function setAggregationVKey(bytes32 _aggregationVkey) external onlyAdmin {
        aggregationVkey = _aggregationVkey;
    }

    // function to save the customData
    function onVerifyPessimistic(
        bytes memory customData
    ) external onlyRollupManager {
        (
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber
        ) = abi.decode(customData, (bytes32, uint128, uint128));
        // storage chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );

        emit OnVerifyPessimistic(
            initStateRoot,
            initTimestamp,
            initL2BlockNumber
        );
    }
}

// another approach is to get the data from the rollupManager contract
// if the networkID is known, then:
// rollup.lastStateRoot --> call
// newStateRoot --> calldata first context (cannot be read unless it is forwarded)
// newL2BlockNumber --> calldata first context (cannot be read unless it is forwarded)
