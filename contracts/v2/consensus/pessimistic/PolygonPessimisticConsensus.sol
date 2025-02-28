// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../../lib/PolygonConsensusBase.sol";
import "../../interfaces/IPolygonPessimisticConsensus.sol";
import "../../interfaces/IPolygonConsensusInitializable.sol";

contract PolygonPessimisticConsensus is
    PolygonConsensusBase,
    IPolygonPessimisticConsensus,
    IPolygonConsensusInitializable
{
    uint32 public constant CONSENSUS_TYPE = 0;

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Rollup manager address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {}

    /**
     * @param _admin Admin address
     * @param sequencer Trusted sequencer address
     * @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     */
    function initialize(
        address _admin,
        address sequencer,
        uint32, //networkID,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) external virtual onlyRollupManager initializer {
        // Set initialize variables
        _initializePolygonConsensusBase(
            _admin,
            sequencer,
            _gasTokenAddress,
            sequencerURL,
            _networkName
        );
    }
    /**
     * Note Return the necessary consensus information for the proof hashed
     */
    function getConsensusHash() public view returns (bytes32) {
        return keccak256(abi.encodePacked(CONSENSUS_TYPE, trustedSequencer));
    }
}
