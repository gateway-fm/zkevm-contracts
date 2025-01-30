// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../lib/AggchainBase.sol";
import "../interfaces/IAggchain.sol";
import "../AggLayerGateway.sol";

/**
 * @title AggchainFEP
 * @notice Generic aggchain based on full execution proof that relies on op-succinct stack.
 * op-succinct (more concretely op-proposer) will build the state transition proof (op-fep).
 * This proof, along with bridge checks, constitutes the final FEP proof.
 */
contract AggchainFEP is AggchainBase, IAggchain {
    // op-stack parameters
    bytes32 public aggregationVkey;
    bytes32 public chainConfigHash;
    bytes32 public rangeVkeyCommitment;

    // Struct to store the chain data every time pessimistic proof is verified
    struct ChainData {
        bytes32 lastStateRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }
    // Array of stored chain data
    ChainData[] public chainData;

    //////////
    // Events
    /////////

    /**
     * @dev Emitted when Pessimistic proof is verified
     * @param initStateRoot Initial state root
     * @param initTimestamp Initial timestamp
     * @param initL2BlockNumber Initial L2 block number
     */
    event OnVerifyPessimistic(
        bytes32 initStateRoot,
        uint128 initTimestamp,
        uint128 initL2BlockNumber
    );

    /**
     * @param _rollupManager Rollup manager address.
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token address.
     * @param _bridgeAddress Bridge address.
     * @param _aggLayerGateway AggLayerGateway address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        AggLayerGateway _aggLayerGateway
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
     * @param initializeBytesCustomChain  Encoded params to initialize the chain. Each aggchain has its custom decoded params
     * @dev The reinitializer(2) is set because it can also be initialized differently with 'initializeAfterUpgrade' function but only be initialized once.
     */
    function initialize(
        bytes calldata initializeBytesCustomChain
    ) external override onlyRollupManager onlyNotInitialized reinitializer(2) {
        // custom parsing of the initializeBytesCustomChain
        // question: gasTokenNetwork?? gastoken metadata?
        (
            address _admin,
            address _trustedSequencer,
            address _gasTokenAddress,
            string memory _trustedSequencerURL,
            string memory _networkName,
            bytes32 _aggregationVkey,
            bytes32 _chainConfigHash,
            bytes32 _rangeVkeyCommitment,
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber
        ) = abi.decode(
                initializeBytesCustomChain,
                (
                    address,
                    address,
                    address,
                    string,
                    string,
                    bytes32,
                    bytes32,
                    bytes32,
                    bytes32,
                    uint128,
                    uint128
                )
            );

        // set chain variables
        admin = _admin;
        trustedSequencer = _trustedSequencer;
        gasTokenAddress = _gasTokenAddress;
        trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;
        aggregationVkey = _aggregationVkey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
        // storage first chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );
    }

    /**
     * @notice Initialize the chain after upgrade.
     * @param initializeBytesCustomChain  Encoded params to initialize the chain after upgrade. Each aggchain has its custom decoded params
     * @dev The reinitializer(2) is set because it can also be initialized differently with 'initialize' function but only be initialized once.
     * @dev This function can only be called if reinitializer(2) has not been initialized
     */
    function initializeAfterUpgrade(
        bytes calldata initializeBytesCustomChain
    ) external onlyRollupManager onlyInitialized reinitializer(2) {
        // Only need to initialize values that are specific for FEP because we are performing an upgrade from a Pessimistic chain
        (
            bytes32 _aggregationVkey,
            bytes32 _chainConfigHash,
            bytes32 _rangeVkeyCommitment,
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber
        ) = abi.decode(
                initializeBytesCustomChain,
                (bytes32, bytes32, bytes32, bytes32, uint128, uint128)
            );

        // set chain variables
        aggregationVkey = _aggregationVkey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
        // storage first chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );
    }

    //////////////////
    // Modifiers
    //////////////////

    modifier onlyNotInitialized() {
        // This function can only be called if the storage values initializer(1)/initializer has never been initialized
        if (_getInitializedVersion() != 0) {
            revert InvalidInitializer();
        }
        _;
    }

    modifier onlyInitialized() {
        // This function can only be called if the storage value initializer(1)/initializer has been initialized
        if (_getInitializedVersion() != 1) {
            revert InvalidInitializer();
        }
        _;
    }

    /**
     * Note Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainConfig |
     * length (bits):   |    32         |       256      | 256           |
     * uint256 aggchainConfig = keccak256(abi.encodePacked(l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey))
     */
    /// @inheritdoc IAggchain
    function getAggchainHash(
        bytes memory customChainData
    ) external view returns (bytes32) {
        (
            bytes2 aggchainSelector,
            bytes32 l1Head,
            bytes32 l2PreRoot,
            bytes32 claimRoot,
            uint256 claimBlockNum
        ) = abi.decode(
                customChainData,
                (bytes2, bytes32, bytes32, bytes32, uint256)
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
        bytes4 finalAggchainSelector = _getAggchainSelectorFromType(
            AggchainType.ECDSA,
            aggchainSelector
        );
        return
            keccak256(
                abi.encodePacked(
                    AGGCHAIN_TYPE,
                    getAggchainVKey(finalAggchainSelector),
                    aggchainConfig
                )
            );
    }

    /**
     * Note Update the custom params set at initialization
     * TODO: add a timelock delay to avoid invalidate proofs
     * @param customInitializeData Encoded custom params to update
     */
    function updateCustomInitializeData(
        bytes calldata customInitializeData
    ) external onlyAdmin {
        // custom parsing of the customInitializeData
        (
            bytes32 _aggregationVkey,
            bytes32 _chainConfigHash,
            bytes32 _rangeVkeyCommitment
        ) = abi.decode(customInitializeData, (bytes32, bytes32, bytes32));
        aggregationVkey = _aggregationVkey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
    }

    /**
     * @notice Callback function called after verifying a pessimistic proof
     * @param customData Encoded custom data of the chain data to store
     */
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
