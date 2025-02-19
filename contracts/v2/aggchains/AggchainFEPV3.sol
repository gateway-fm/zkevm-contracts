// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

// imports aggLayer
import "../lib/AggchainBase.sol";
import "../interfaces/IAggchain.sol";

/// @custom:implementation
/// @title AggChainFEPV3
/// @notice Heavily based on https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol
/// @dev this contract aims to be the implementation of a FEP chain that is attached to the aggLayer
///       contract is responsible for managing the states and the updates of a L2 network
contract AggchainFEPV3 is AggchainBase, IAggchain {
    ////////////////////////////////////////////////////////////
    //                  Constants & Inmutables                //
    ////////////////////////////////////////////////////////////

    // Aggchain type selector, hardcoded value used to force the first 2 byes of aggchain selector to retrieve the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE_SELECTOR = 0x0001;

    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    /// @notice Parameters to initialize the AggChainFEP contract.
    struct InitParams {
        uint256 l2BlockTime;
        bytes32 rollupConfigHash;
        bytes32 startingOutputRoot;
        uint256 startingBlockNumber;
        uint256 startingTimestamp;
        uint256 submissionInterval;
        address aggChainManager;
        address optimisticModeManager;
    }

    /// @notice OutputProposal represents a commitment to the L2 state. The timestamp is the L1
    ///         timestamp that the output root is posted.
    /// @custom:field outputRoot    Hash of the L2 output.
    /// @custom:field timestamp     Timestamp of the L1 block that the output root was submitted in.
    /// @custom:field l2BlockNumber L2 block number that the output corresponds to.
    struct OutputProposal {
        bytes32 outputRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    ////////////////////////////////////////////////////////////
    //                       Storage                          //
    ////////////////////////////////////////////////////////////

    /// @notice An array of L2 output proposals.
    OutputProposal[] internal l2Outputs;

    /// @notice The number of the first L2 block recorded in this contract.
    uint256 public startingBlockNumber;

    /// @notice The timestamp of the first L2 block recorded in this contract.
    uint256 public startingTimestamp;

    /// @notice The minimum interval in L2 blocks at which checkpoints must be submitted.
    uint256 public submissionInterval;

    /// @notice The time between L2 blocks in seconds. Once set, this value MUST NOT be modified.
    uint256 public l2BlockTime;

    /// @notice The hash of the chain's rollup configuration
    bytes32 public rollupConfigHash;

    /// @notice Activate optimistic mode. When true, the chain can bypass the state transistion verification
    ///         and a trustedSequencer signature is needed to do a state transition.
    bool public optimisticMode;

    /// @notice Address that manages all the functionalities related to the aggChain
    address public aggChainManager;

    /// @notice This account will be able to accept the aggChainManager role
    address public pendingAggChainManager;

    /// @notice Address that can trigger the optimistic mode
    ///         This mode should be used when the chain is in a state that is not possible to verify and it should be treated as an emergency mode
    address public optimisticModeManager;

    /// @notice This account will be able to accept the optimisticModeManager role
    address public pendingOptimisticModeManager;

    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////

    /// @notice Value to detect if the contract has been initialized previously.
    ///         This mechanism is used to migrate chains that have been already
    ///         initialized with a 'PolygonPessimisticConsensus' implementation
    uint8 private transient _currentVersion;

    ////////////////////////////////////////////////////////////
    //                         Events                         //
    ////////////////////////////////////////////////////////////

    /// @notice Emitted when an FEP is verified.
    /// @param outputRoot    The output root.
    /// @param l2OutputIndex The index of the output in the l2Outputs array.
    /// @param l2BlockNumber The L2 block number of the output root.
    /// @param l1Timestamp   The L1 timestamp when proposed.
    event VerifyAggChainFEP(
        bytes32 indexed outputRoot, uint256 indexed l2OutputIndex, uint256 indexed l2BlockNumber, uint256 l1Timestamp
    );

    /// @notice Emitted when the rollup config hash is updated.
    /// @param oldRollupConfigHash The old rollup config hash.
    /// @param newRollupConfigHash The new rollup config hash.
    event RollupConfigHashUpdated(bytes32 indexed oldRollupConfigHash, bytes32 indexed newRollupConfigHash);

    /// @notice Emitted when the submission interval is updated.
    /// @param oldSubmissionInterval The old submission interval.
    /// @param newSubmissionInterval The new submission interval.
    event SubmissionIntervalUpdated(uint256 oldSubmissionInterval, uint256 newSubmissionInterval);

    /// @notice Emitted when the optimistic mode is toggled.
    /// @param enabled Indicates whether optimistic mode is enabled or disabled.
    event OptimisticModeToggled(bool indexed enabled);

    /// @dev Emitted when the aggChainManager starts the two-step transfer role setting a new pending newAggChainManager
    /// @param newPendingAggChainManager The new pending aggChainManager
    event TransferAggChainManagerRole(address newPendingAggChainManager);

    /// @notice Emitted when the pending aggChainManager accepts the aggChainManager role
    /// @param newAggChainManager The new aggChainManager
    event AcceptAggChainManagerRole(address newAggChainManager);

    /// @dev Emitted when the optimisticModeManager starts the two-step transfer role setting a new pending optimisticModeManager
    /// @param newPendingOptimisticModeManager The new pending optimisticModeManager
    event TransferOptimisticModeManagerRole(address newPendingOptimisticModeManager);

    /// @notice Emitted when the pending optimisticModeManager accepts the optimisticModeManager role
    /// @param newOptimisticModeManager The new optimisticModeManager
    event AcceptOptimisticModeManagerRole(address newOptimisticModeManager);

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////

    /// @notice optimistic mode is not enabled.
    error OptimisticModeNotEnabled();

    /// @notice optimistic mode is enabled.
    error OptimisticModeEnabled();

    /// @notice submission interval must be greater than 0.
    error SubmissionIntervalGreaterThanZero();

    /// @notice L2 block time must be greater than 0
    error L2BlockTimeGreaterThanZero();

    /// @notice starting L2 timestamp must be less than current time
    error StartL2TimestampGreaterThanCurrentTime();

    /// @notice block number must be greater than or equal to next expected block number.
    error L2BlockNumberLessThanNextBlockNumber();

    /// @notice cannot propose L2 output in the future
    error CannotProposeFutureL2Output();

    /// @notice L2 output proposal cannot be the zero hash
    error L2OutputRootCannotBeZero();

    /// @notice Thrown when the caller is not the aggChain manager
    error OnlyAggChainManager();

    /// @notice Thrown when the caller is not the pending aggChain manager
    error OnlyPendingAggChainManager();

    /// @notice Thrown when the caller is not the optimistic mode manager
    error OnlyOptimisticModeManager();

    /// @notice Thrown when the caller is not the pending optimistic mode manager
    error OnlyPendingOptimisticModeManager();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    modifier whenOptimistic() {
        if (!optimisticMode) {
            revert OptimisticModeNotEnabled();
        }
        _;
    }

    modifier whenNotOptimistic() {
        if (optimisticMode) {
            revert OptimisticModeEnabled();
        }
        _;
    }

    modifier getInitializedVersion() {
        _currentVersion = _getInitializedVersion();
        _;
    }

    modifier onlyAggChainManager() {
        if (aggChainManager != msg.sender) {
            revert OnlyAggChainManager();
        }
        _;
    }

    modifier onlyOptimisticModeManager() {
        if (optimisticModeManager != msg.sender) {
            revert OnlyOptimisticModeManager();
        }
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////

    /// @notice Constructor AggChainFEPV3 contract
    /// @param _globalExitRootManager Global exit root manager address
    /// @param _pol POL token address
    /// @param _bridgeAddress Bridge address
    /// @param _rollupManager Global exit root manager address
    /// @param _aggLayerGateway agglayer gateway address
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    ) AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
    )
    {}

    ////////////////////////////////////////////////////////////
    //              Functions: initialization                 //
    ////////////////////////////////////////////////////////////

    /// @notice Initialize function for the contract.
    /// @custom:security First initializition takes into account this contracts and all the inheritance contracts
    ///                  Second initialization does not initialize PolygonConsensusBase parameters
    ///                  Second initialization can happen if a chain is upgraded from a PolygonPessimistocConsensus
    /// @param initializeBytesAggchain Encoded bytes to initialize the aggchain
    function initialize(
        bytes memory initializeBytesAggchain
    ) external onlyRollupManager getInitializedVersion reinitializer(2) {
        // initialize all parameters
        if (_currentVersion == 0) {
            // Decode the struct
            (
                // chain custom params
                InitParams memory _initParams,
                // aggchainBase params
                bool _useOwnedGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes2 _initAggchainVKeySelector,
                address _vKeyManager,
                // PolygonConensusBase params
                address _admin,
                address _trustedSequencer,
                address _gasTokenAddress,
                string memory _trustedSequencerURL,
                string memory _networkName
            ) = abi.decode(
                initializeBytesAggchain,
                (InitParams, bool, bytes32, bytes2, address, address, address, address, string, string)
            );

            // init FEP params
            _initializeAggchain(_initParams);

            // init aggchain params
            _initializeAggchainBase(_useOwnedGateway, _initOwnedAggchainVKey, _initAggchainVKeySelector, _vKeyManager);

            // init polygonConsensusBase params
            _initializePolygonConsensusBase(_admin, _trustedSequencer, _gasTokenAddress, _trustedSequencerURL, _networkName);
        } else if (_currentVersion == 1) {
            // contract has been previously initilaized with all parameters in the PolygonConsensusBase.sol
            // Only initialize the FEP and AggChainBase params
            (
                // chain custom params
                InitParams memory _initParams,
                // aggchainBase params
                bool _useOwnedGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes2 _initAggchainVKeySelector,
                address _vKeyManager
            ) = abi.decode(
                initializeBytesAggchain,
                (InitParams, bool, bytes32, bytes2, address)
            );

            // init FEP params
            _initializeAggchain(_initParams);

            // init aggchain params
            _initializeAggchainBase(_useOwnedGateway, _initOwnedAggchainVKey, _initAggchainVKeySelector, _vKeyManager);
        }
    }

    /// @notice Initializer AggChainFEP storage
    /// @param _initParams The initialization parameters for the contract.
    function _initializeAggchain(InitParams memory _initParams) internal {
        if (_initParams.submissionInterval == 0) {
            revert SubmissionIntervalGreaterThanZero();
        }

        if (_initParams.l2BlockTime == 0) {
            revert L2BlockTimeGreaterThanZero();
        }

        if (_initParams.startingTimestamp > block.timestamp) {
            revert StartL2TimestampGreaterThanCurrentTime();
        }

        submissionInterval = _initParams.submissionInterval;
        l2BlockTime = _initParams.l2BlockTime;

        // For proof verification to work, there must be an initial output.
        // Disregard the _startingBlockNumber and _startingTimestamp parameters during upgrades, as they're already set.
        if (l2Outputs.length == 0) {
            l2Outputs.push(
                OutputProposal({
                    outputRoot: _initParams.startingOutputRoot,
                    timestamp: uint128(_initParams.startingTimestamp),
                    l2BlockNumber: uint128(_initParams.startingBlockNumber)
                })
            );

            startingBlockNumber = _initParams.startingBlockNumber;
            startingTimestamp = _initParams.startingTimestamp;
        }

        rollupConfigHash = _initParams.rollupConfigHash;
        aggChainManager = _initParams.aggChainManager;
        optimisticModeManager = _initParams.optimisticModeManager;
    }

    /// @notice Initializer AggchainBase storage
    /// @param _useOwnedGateway Flag to setup initial values for the owned gateway
    /// @param _initOwnedAggchainVKey Initial owned aggchain verification key
    /// @param _initAggchainVKeySelector Initial aggchain selector
    /// @param _vKeyManager Initial vKeyManager
    function _initializeAggchainBase(bool _useOwnedGateway, bytes32 _initOwnedAggchainVKey, bytes2 _initAggchainVKeySelector, address _vKeyManager) internal {
        useDefaultGateway = _useOwnedGateway;
        // set the initial aggchain keys
        ownedAggchainVKeys[_getFinalAggchainVKeySelectorFromType(_initAggchainVKeySelector, AGGCHAIN_TYPE_SELECTOR)] = _initOwnedAggchainVKey;
        // set initial vKeyManager
        vKeyManager = _vKeyManager;
    }

    /// @notice Initializer PolygonConsensusBase storage
    /// @param _admin Admin address
    /// @param sequencer Trusted sequencer address
    /// @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
    /// Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
    /// @param sequencerURL Trusted sequencer URL
    /// @param _networkName L2 network name
    function _initializePolygonConsensusBase(address _admin, address sequencer, address _gasTokenAddress, string memory sequencerURL, string memory _networkName) internal {
        admin = _admin;
        trustedSequencer = sequencer;

        trustedSequencerURL = sequencerURL;
        networkName = _networkName;

        gasTokenAddress = _gasTokenAddress;
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////

    /// @notice Callback while pessimistic proof is being verified from the rollup manager
    /// @notice Returns the aggchain hash for a given aggchain data
    ///
    ///     aggchain_hash:
    ///     Field:           | AGGCHAIN_TYPE | aggchain_vkey  | aggchain_params  |
    ///     length (bits):   | 32            | 256            | 256              |
    ///
    ///     aggchain_params:
    ///     Field:           | l2PreRoot         | claimRoot          | claimBlockNum      | rollupConfigHash     | optimisticMode  | trustedSequencer |
    ///     length (bits):   | 256               | 256                | 256                | 256                  | 8               | 160              |
    ///
    /// @param aggChainData custom bytes provided by the chain
    /// @return aggchainHash resulting aggchain hash
    function getAggchainHash(
        bytes memory aggChainData
    ) external view returns (bytes32) {
        // decode the customChainData
        (
            bytes2 _aggchainSelector,
            bytes32 _outputRoot,
            uint256 _l2BlockNumber
        ) = abi.decode(
            aggChainData,
            (bytes2, bytes32, uint256));

        // check blockNumber
        if (_l2BlockNumber < nextBlockNumber()) {
            revert L2BlockNumberLessThanNextBlockNumber();
        }

        // check timestamp
        if (computeL2Timestamp(_l2BlockNumber) >= block.timestamp) {
            revert CannotProposeFutureL2Output();
        }

        // check non-zero stateroot
        if (_outputRoot == bytes32(0)) {
            revert L2OutputRootCannotBeZero();
        }

        bytes4 finalAggchainSelector = _getFinalAggchainVKeySelectorFromType(_aggchainSelector, AGGCHAIN_TYPE_SELECTOR);

        bytes32 aggchainParams = keccak256(
            abi.encodePacked(
                l2Outputs[latestOutputIndex()].outputRoot,
                _outputRoot,
                _l2BlockNumber,
                rollupConfigHash,
                optimisticMode,
                trustedSequencer
            )
        );

        return
            keccak256(
                abi.encodePacked(
                    AGGCHAIN_TYPE,
                    getAggchainVKey(finalAggchainSelector),
                    aggchainParams
                )
            );
    }

    /// @notice Getter for the submissionInterval.
    ///         Public getter is legacy and will be removed in the future. Use `submissionInterval` instead.
    /// @return Submission interval.
    function SUBMISSION_INTERVAL() external view returns (uint256) {
        return submissionInterval;
    }

    /// @notice Getter for the l2BlockTime.
    ///         Public getter is legacy and will be removed in the future. Use `l2BlockTime` instead.
    /// @return L2 block time.
    function L2_BLOCK_TIME() external view returns (uint256) {
        return l2BlockTime;
    }

    /// @notice Returns an output by index. Needed to return a struct instead of a tuple.
    /// @param _l2OutputIndex Index of the output to return.
    /// @return l2Output The output at the given index.
    function getL2Output(uint256 _l2OutputIndex) external view returns (OutputProposal memory) {
        return l2Outputs[_l2OutputIndex];
    }

    /// @notice Returns the number of outputs that have been proposed.
    ///         Will revert if no outputs have been proposed yet.
    /// @return latestOutputIndex The number of outputs that have been proposed.
    function latestOutputIndex() public view returns (uint256) {
        return l2Outputs.length - 1;
    }

    /// @notice Returns the index of the next output to be proposed.
    /// @return nextOutputIndex The index of the next output to be proposed.
    function nextOutputIndex() public view returns (uint256) {
        return l2Outputs.length;
    }

    /// @notice Returns the block number of the latest submitted L2 output proposal.
    ///         If no proposals been submitted yet then this function will return the starting
    ///         block number.
    /// @return latestBlockNumber Latest submitted L2 block number.
    function latestBlockNumber() public view returns (uint256) {
        return l2Outputs.length == 0 ? startingBlockNumber : l2Outputs[l2Outputs.length - 1].l2BlockNumber;
    }

    /// @notice Computes the block number of the next L2 block that needs to be checkpointed.
    /// @return nextBlockNumber Next L2 block number.
    function nextBlockNumber() public view returns (uint256) {
        return latestBlockNumber() + submissionInterval;
    }

    /// @notice Returns the L2 timestamp corresponding to a given L2 block number.
    /// @param _l2BlockNumber The L2 block number of the target block.
    /// @return L2timestamp timestamp of the given block.
    function computeL2Timestamp(uint256 _l2BlockNumber) public view returns (uint256) {
        return startingTimestamp + ((_l2BlockNumber - startingBlockNumber) * l2BlockTime);
    }

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /// @notice Callback when pessimistic proof is verified, can only be called by the rollup manager
    ///         Stores the necessary chain data when the pessimistic proof is verified
    /// @param aggChainData Custom data provided by the chain
    function onVerifyPessimistic(
        bytes memory aggChainData
    ) external onlyRollupManager {

        // decode the customChainData
        (
            bytes2 _aggchainSelector,
            bytes32 _outputRoot,
            uint256 _l2BlockNumber
        ) = abi.decode(
            aggChainData,
            (bytes2, bytes32, uint256));

        emit VerifyAggChainFEP(_outputRoot, nextOutputIndex(), _l2BlockNumber, block.timestamp);

        l2Outputs.push(
            OutputProposal({
                outputRoot: _outputRoot,
                timestamp: uint128(block.timestamp),
                l2BlockNumber: uint128(_l2BlockNumber)
            })
        );
    }

    ////////////////////////////////////////////////////////////
    //                  Functions: admin                      //
    ////////////////////////////////////////////////////////////

    /// @notice Update the submission interval.
    /// @param _submissionInterval The new submission interval.
    function updateSubmissionInterval(uint256 _submissionInterval) external onlyAggChainManager {
        emit SubmissionIntervalUpdated(submissionInterval, _submissionInterval);
        submissionInterval = _submissionInterval;
    }

    /// @notice Updates the rollup config hash.
    /// @param _rollupConfigHash The new rollup config hash.
    function updateRollupConfigHash(bytes32 _rollupConfigHash) external onlyAggChainManager {
        emit RollupConfigHashUpdated(rollupConfigHash, _rollupConfigHash);
        rollupConfigHash = _rollupConfigHash;
    }

    /// @notice Enables optimistic mode.
    function enableOptimisticMode() external onlyOptimisticModeManager whenNotOptimistic {
        optimisticMode = true;
        emit OptimisticModeToggled(true);
    }

    /// @notice Disables optimistic mode.
    function disableOptimisticMode() external onlyOptimisticModeManager whenOptimistic {
        optimisticMode = false;
        emit OptimisticModeToggled(false);
    }

    ////////////////////////////////////////////////////////////
    //          Functions: manage admin addresses             //
    ////////////////////////////////////////////////////////////

    /// @notice Starts the aggChainManager role transfer
    ///         This is a two step process, the pending aggChainManager must accept to finalize the process
    /// @param newAggChainManager Address of the new aggChainManager
    function transferAggChainManagerRole(
        address newAggChainManager
    ) external onlyAggChainManager {
        pendingAggChainManager = newAggChainManager;
        emit TransferAggChainManagerRole(newAggChainManager);
    }

    /// @notice Allow the current pending aggChainManager to accept the aggChainManager role
    function acceptAggChainManagerRole() external {
        if (pendingAggChainManager != msg.sender) {
            revert OnlyPendingAggChainManager();
        }
        aggChainManager = pendingAggChainManager;
        emit AcceptAggChainManagerRole(pendingAggChainManager);
    }

    /// @notice Starts the optimisticModeManager role transfer
    /// This is a two step process, the pending optimisticModeManager must accepted to finalize the process
    /// @param newOptimisticModeManager Address of the new optimisticModeManager
    function transferOptimisticModeManagerRole(
        address newOptimisticModeManager
    ) external onlyOptimisticModeManager {
        pendingOptimisticModeManager = newOptimisticModeManager;
        emit TransferOptimisticModeManagerRole(newOptimisticModeManager);
    }

    /// @notice Allow the current pending optimisticModeManager to accept the optimisticModeManager role
    function acceptOptimisticModeManagerRole() external {
        if (pendingOptimisticModeManager != msg.sender) {
            revert OnlyPendingOptimisticModeManager();
        }
        optimisticModeManager = pendingOptimisticModeManager;
        emit AcceptOptimisticModeManagerRole(pendingOptimisticModeManager);
    }
}