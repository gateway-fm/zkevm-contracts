// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

// imports aggLayer
import "../lib/AggchainBase.sol";
import "../interfaces/IAggchain.sol";
import "../interfaces/ISemver.sol";

/// @custom:proxied
/// @title AggChainFEP
/// @notice Heavily based on https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol
/// @dev this contract aims to be the implementation of a FEP chain that is attached to the aggLayer
///       contract is responsible for managing the states and the updates of a L2 network
contract AggchainFEP is AggchainBase, IAggchain, ISemver {
    ////////////////////////////////////////////////////////////
    //                  Constants & Inmutables                //
    ////////////////////////////////////////////////////////////

    /// @notice Semantic version.
    string public constant version = "v1.0.0";

    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    /// @notice Parameters to initialize the AggChainFEP contract.
    struct InitParams {
        address rollbackStateAdmin;
        uint256 finalizationPeriodSeconds;
        uint256 l2BlockTime;
        bytes32 rangeVkeyCommitment;
        bytes32 rollupConfigHash;
        bytes32 startingOutputRoot;
        uint256 startingBlockNumber;
        uint256 startingTimestamp;
        uint256 submissionInterval;
    }

    /// @notice The public values committed to for an OP Succinct aggregation program.
    struct AggregationOutputs {
        bytes32 l1Head;
        bytes32 l2PreRoot;
        bytes32 claimRoot;
        uint256 claimBlockNum;
        bytes32 rollupConfigHash;
        bytes32 rangeVkeyCommitment;
    }

    /// @notice OutputProposal represents a commitment to the L2 state. The timestamp is the L1
    ///         timestamp that the output root is posted. This timestamp is used to verify that the
    ///         finalization period has passed since the output root was submitted.
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

    /// @notice The address of the rollbackStateAdmin. Can be updated via upgrade.
    address public rollbackStateAdmin;

    /// @notice The minimum time (in seconds) that must elapse before a L2 Proposal can be finalized.
    uint256 public finalizationPeriodSeconds;

    /// @notice The 32 byte commitment to the BabyBear representation of the verification key of the range SP1 program. Specifically,
    /// this verification is the output of converting the [u32; 8] range BabyBear verification key to a [u8; 32] array.
    bytes32 public rangeVkeyCommitment;

    /// @notice The hash of the chain's rollup config, which ensures the proofs submitted are for the correct chain.
    bytes32 public rollupConfigHash;

    /// @notice A trusted mapping of block numbers to block hashes.
    mapping(uint256 => bytes32) public historicBlockHashes;

    /// @notice Activate optimistic mode. When true, the chain can bypass the state transistion verification
    ///         and a trustedSequencer signature is needed to do a state transition.
    bool public optimisticMode;

    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////

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

    /// @notice Emitted when outputs are deleted.
    /// @param prevNextOutputIndex Next L2 output index before the deletion.
    /// @param newNextOutputIndex  Next L2 output index after the deletion.
    event OutputsDeleted(uint256 indexed prevNextOutputIndex, uint256 indexed newNextOutputIndex);

    /// @notice Emitted when the range verification key commitment is updated.
    /// @param oldRangeVkeyCommitment The old range verification key commitment.
    /// @param newRangeVkeyCommitment The new range verification key commitment.
    event RangeVkeyCommitmentUpdated(bytes32 indexed oldRangeVkeyCommitment, bytes32 indexed newRangeVkeyCommitment);

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
    /// @param finalizationPeriodSeconds The new finalization period in seconds.
    event OptimisticModeToggled(bool indexed enabled, uint256 finalizationPeriodSeconds);

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////

    /// @notice The L1 block hash is not available. If the block hash requested is not in the last 256 blocks,
    ///         it is not available.
    error L1BlockHashNotAvailable();

    /// @notice The L1 block hash is not checkpointed.
    error L1BlockHashNotCheckpointed();

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

    /// @notice vKey Routes and selectors length mismatch
    error AggchainVKeyRoutesLengthMismatch();

    /// @notice block number must be greater than or equal to next expected block number.
    error L2BlockNumberLessThanNextBlockNumber();

    /// @notice cannot propose L2 output in the future
    error CannotProposeFutureL2Output();

    /// @notice L2 output proposal cannot be the zero hash
    error L2OutputRootCannotBeZero();

    /// @notice cannot get output for a block that has not been proposed
    error NoL2OutpoutUnprocessedBlock();

    /// @notice cannot get output as no outputs have been proposed yet
    error NoL2OutputProposed();

    /// @notice only the rollbackStateAdmin address can delete outputs
    error OnlyRollbackStateAdmin();

    /// @notice cannot delete outputs after the latest output index
    error CannotRollbackPastLatestOutput();

    /// @notice cannot delete outputs that have already been finalized
    error CannotDeleteFinalizedOutputs();

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

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////

    /// @notice Constructs the OPSuccinctL2OutputOracle contract. Disables initializers.
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

    /**
     * @param initializeBytesCustomChain Encoded params to initialize the chain
     */
    function initialize(
        bytes memory initializeBytesCustomChain
    ) external onlyRollupManager getInitializedVersion reinitializer(2) {

        // initialize all parameters
        if (_currentVersion == 0) {
            // Decode the struct
            (
                // chain custom params
                InitParams memory _initParams,
                // aggchainBase params
                bool _useOwnedGateway,
                AggchainVKeyRoute[] memory _vKeyRoutes, // initialize aggchain keys
                bytes4[] memory _aggchainVKeySelectors,
                // PolygonConensusBase params
                address _admin,
                address _trustedSequencer,
                address _gasTokenAddress,
                string memory _trustedSequencerURL,
                string memory _networkName
            ) = abi.decode(
                initializeBytesCustomChain,
                (InitParams, bool, AggchainVKeyRoute[], bytes4[], address, address, address, string, string)
            );

            // init FEP params
            _initializeAggchain(_initParams);

            // init aggchain params
            _initializeAggchainBase(_useOwnedGateway, _vKeyRoutes, _aggchainVKeySelectors);

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
                AggchainVKeyRoute[] memory _vKeyRoutes,
                bytes4[] memory _aggchainVKeySelectors
            ) = abi.decode(
                initializeBytesCustomChain,
                (InitParams, bool, AggchainVKeyRoute[], bytes4[])
            );

            // init FEP params
            _initializeAggchain(_initParams);

            // init aggchain params
            _initializeAggchainBase(_useOwnedGateway, _vKeyRoutes, _aggchainVKeySelectors);
        }
    }

    /// @notice Initializer.
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

        rollbackStateAdmin = _initParams.rollbackStateAdmin;
        finalizationPeriodSeconds = _initParams.finalizationPeriodSeconds;

        rangeVkeyCommitment = _initParams.rangeVkeyCommitment;
        rollupConfigHash = _initParams.rollupConfigHash;
    }

    function _initializeAggchainBase(bool _useOwnedGateway, AggchainVKeyRoute[] memory _vKeyRoutes, bytes4[] memory _aggchainVKeySelectors) internal {
        useOwnedGateway = _useOwnedGateway;
        // set the authRoutes
        if (_vKeyRoutes.length != _aggchainVKeySelectors.length) {
            revert AggchainVKeyRoutesLengthMismatch();
        }

        // TODO: compute specififc _aggchainVKeySelectors
        for (uint256 i = 0; i < _vKeyRoutes.length; i++) {
            aggchainVKeyRoutes[_aggchainVKeySelectors[i]] = _vKeyRoutes[i];
        }
    }

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

    function getAggchainHash(
        bytes memory aggChainData
    ) external view returns (bytes32) {
        // decode the customChainData
        (
            bytes2 _aggchainSelector,
            bytes32 _outputRoot,
            uint256 _l2BlockNumber,
            uint256 _l1BlockNumber
        ) = abi.decode(
            aggChainData,
            (bytes2, bytes32, uint256, uint256));

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

        bytes32 l1BlockHash = historicBlockHashes[_l1BlockNumber];
        if (l1BlockHash == bytes32(0)) {
            revert L1BlockHashNotCheckpointed();
        }

        bytes4 finalAggchainSelector = _getAggchainSelectorFromType(
            AggchainType.FEP,
            _aggchainSelector
        );

        return
            keccak256(
                abi.encodePacked(
                    AGGCHAIN_TYPE,
                    getAggchainVKey(finalAggchainSelector),
                    l1BlockHash,
                    l2Outputs[latestOutputIndex()].outputRoot,
                    _outputRoot,
                    _l2BlockNumber,
                    rollupConfigHash,
                    rangeVkeyCommitment,
                    trustedSequencer,
                    optimisticMode
                )
            );
    }

    /// @notice Getter for the submissionInterval.
    ///         Public getter is legacy and will be removed in the future. Use `submissionInterval` instead.
    /// @return Submission interval.
    /// @custom:legacy
    function SUBMISSION_INTERVAL() external view returns (uint256) {
        return submissionInterval;
    }

    /// @notice Getter for the l2BlockTime.
    ///         Public getter is legacy and will be removed in the future. Use `l2BlockTime` instead.
    /// @return L2 block time.
    /// @custom:legacy
    function L2_BLOCK_TIME() external view returns (uint256) {
        return l2BlockTime;
    }

    /// @notice Getter for the rollbackStateAdmin address.
    /// @return Address of the rollbackStateAdmin.
    function ROLLBACK_ADDRESS() external view returns (address) {
        return rollbackStateAdmin;
    }

    /// @notice Getter for the finalizationPeriodSeconds.
    ///         Public getter is legacy and will be removed in the future. Use `finalizationPeriodSeconds` instead.
    /// @return Finalization period in seconds.
    /// @custom:legacy
    function FINALIZATION_PERIOD_SECONDS() external view returns (uint256) {
        return finalizationPeriodSeconds;
    }

     /// @notice Returns an output by index. Needed to return a struct instead of a tuple.
    /// @param _l2OutputIndex Index of the output to return.
    /// @return The output at the given index.
    function getL2Output(uint256 _l2OutputIndex) external view returns (OutputProposal memory) {
        return l2Outputs[_l2OutputIndex];
    }

    /// @notice Returns the index of the L2 output that checkpoints a given L2 block number.
    ///         Uses a binary search to find the first output greater than or equal to the given
    ///         block.
    /// @param _l2BlockNumber L2 block number to find a checkpoint for.
    /// @return Index of the first checkpoint that commits to the given L2 block number.
    function getL2OutputIndexAfter(uint256 _l2BlockNumber) public view returns (uint256) {
        // Make sure an output for this block number has actually been proposed.
        if(_l2BlockNumber > latestBlockNumber()) {
            revert NoL2OutpoutUnprocessedBlock();
        }

        // Make sure there's at least one output proposed.
        if (l2Outputs.length == 0) {
            revert NoL2OutputProposed();
        }

        // Find the output via binary search, guaranteed to exist.
        uint256 lo = 0;
        uint256 hi = l2Outputs.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (l2Outputs[mid].l2BlockNumber < _l2BlockNumber) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }

        return lo;
    }

    /// @notice Returns the L2 output proposal that checkpoints a given L2 block number.
    ///         Uses a binary search to find the first output greater than or equal to the given
    ///         block.
    /// @param _l2BlockNumber L2 block number to find a checkpoint for.
    /// @return First checkpoint that commits to the given L2 block number.
    function getL2OutputAfter(uint256 _l2BlockNumber) external view returns (OutputProposal memory) {
        return l2Outputs[getL2OutputIndexAfter(_l2BlockNumber)];
    }

    /// @notice Returns the number of outputs that have been proposed.
    ///         Will revert if no outputs have been proposed yet.
    /// @return The number of outputs that have been proposed.
    function latestOutputIndex() public view returns (uint256) {
        return l2Outputs.length - 1;
    }

    /// @notice Returns the index of the next output to be proposed.
    /// @return The index of the next output to be proposed.
    function nextOutputIndex() public view returns (uint256) {
        return l2Outputs.length;
    }

    /// @notice Returns the block number of the latest submitted L2 output proposal.
    ///         If no proposals been submitted yet then this function will return the starting
    ///         block number.
    /// @return Latest submitted L2 block number.
    function latestBlockNumber() public view returns (uint256) {
        return l2Outputs.length == 0 ? startingBlockNumber : l2Outputs[l2Outputs.length - 1].l2BlockNumber;
    }

    /// @notice Computes the block number of the next L2 block that needs to be checkpointed.
    /// @return Next L2 block number.
    function nextBlockNumber() public view returns (uint256) {
        return latestBlockNumber() + submissionInterval;
    }

    /// @notice Returns the L2 timestamp corresponding to a given L2 block number.
    /// @param _l2BlockNumber The L2 block number of the target block.
    /// @return L2 timestamp of the given block.
    function computeL2Timestamp(uint256 _l2BlockNumber) public view returns (uint256) {
        return startingTimestamp + ((_l2BlockNumber - startingBlockNumber) * l2BlockTime);
    }

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /// @notice Deletes all output proposals after and including the proposal that corresponds to
    ///         the given output index. Only the rollbackStateAdmin address can delete outputs.
    /// @param _l2OutputIndex Index of the first L2 output to be deleted.
    ///                       All outputs after this output will also be deleted.
    function rollbackState(uint256 _l2OutputIndex) external {
        if (msg.sender != rollbackStateAdmin) {
            revert OnlyRollbackStateAdmin();
        }

        // Make sure we're not *increasing* the length of the array.
        if (_l2OutputIndex >= l2Outputs.length) {
            revert CannotRollbackPastLatestOutput();
        }

        // Do not allow deleting any outputs that have already been finalized.
        // convert to a custom error
        if (block.timestamp - l2Outputs[_l2OutputIndex].timestamp >= finalizationPeriodSeconds) {
            revert CannotDeleteFinalizedOutputs();
        }

        uint256 prevNextL2OutputIndex = nextOutputIndex();

        // Use assembly to delete the array elements because Solidity doesn't allow it.
        assembly {
            sstore(l2Outputs.slot, _l2OutputIndex)
        }

        emit OutputsDeleted(prevNextL2OutputIndex, _l2OutputIndex);
    }

    // function to save the customData
    function onVerifyPessimistic(
        bytes memory aggChainData
    ) external onlyRollupManager {

        // decode the customChainData
        (
            bytes2 selectorHigh,
            bytes32 _outputRoot,
            uint256 _l2BlockNumber,
            uint256 _l1BlockNumber
        ) = abi.decode(
            aggChainData,
            (bytes2, bytes32, uint256, uint256));

        emit VerifyAggChainFEP(_outputRoot, nextOutputIndex(), _l2BlockNumber, block.timestamp);

        l2Outputs.push(
            OutputProposal({
                outputRoot: _outputRoot,
                timestamp: uint128(block.timestamp),
                l2BlockNumber: uint128(_l2BlockNumber)
            })
        );
    }

    /// @notice Checkpoints a block hash at a given block number.
    /// @param _blockNumber Block number to checkpoint the hash at.
    /// @dev If the block hash is not available, this will revert.
    function checkpointBlockHash(uint256 _blockNumber) external {
        bytes32 blockHash = blockhash(_blockNumber);
        if (blockHash == bytes32(0)) {
            revert L1BlockHashNotAvailable();
        }
        historicBlockHashes[_blockNumber] = blockHash;
    }

    ////////////////////////////////////////////////////////////
    //                  Functions: admin                      //
    ////////////////////////////////////////////////////////////

    /// @notice Update the submission interval.
    /// @param _submissionInterval The new submission interval.
    function updateSubmissionInterval(uint256 _submissionInterval) external onlyAdmin {
        emit SubmissionIntervalUpdated(submissionInterval, _submissionInterval);
        submissionInterval = _submissionInterval;
    }

    /// @notice Updates the range verification key commitment.
    /// @param _rangeVkeyCommitment The new range verification key commitment.
    function updateRangeVkeyCommitment(bytes32 _rangeVkeyCommitment) external onlyAdmin {
        emit RangeVkeyCommitmentUpdated(rangeVkeyCommitment, _rangeVkeyCommitment);
        rangeVkeyCommitment = _rangeVkeyCommitment;
    }

    /// @notice Updates the rollup config hash.
    /// @param _rollupConfigHash The new rollup config hash.
    function updateRollupConfigHash(bytes32 _rollupConfigHash) external onlyAdmin {
        emit RollupConfigHashUpdated(rollupConfigHash, _rollupConfigHash);
        rollupConfigHash = _rollupConfigHash;
    }

    /// @notice Enables optimistic mode.
    /// @param _finalizationPeriodSeconds The new finalization window.
    function enableOptimisticMode(uint256 _finalizationPeriodSeconds) external onlyAdmin whenNotOptimistic {
        finalizationPeriodSeconds = _finalizationPeriodSeconds;
        optimisticMode = true;
        emit OptimisticModeToggled(true, _finalizationPeriodSeconds);
    }

    /// @notice Disables optimistic mode.
    /// @param _finalizationPeriodSeconds The new finalization window.
    function disableOptimisticMode(uint256 _finalizationPeriodSeconds) external onlyAdmin whenOptimistic {
        finalizationPeriodSeconds = _finalizationPeriodSeconds;
        optimisticMode = false;
        emit OptimisticModeToggled(false, _finalizationPeriodSeconds);
    }
}