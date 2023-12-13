// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;
import "../PolygonRollupManager.sol";
import "../interfaces/IPolygonRollupBase.sol";
import "../../lib/EmergencyManager.sol";

/**
 * PolygonRollupManager used only to test conensus contracts
 */
contract PolygonRollupManagerEmptyMock is EmergencyManager {
    function onSequenceBatches(
        uint64 newSequencedBatches,
        bytes32 newAccInputHash
    ) external returns (uint64) {
        return 1;
    }

    function onVerifyBatches(
        uint64 finalNewBatch,
        bytes32 newStateRoot,
        IPolygonRollupBase rollup
    ) external returns (uint64) {
        rollup.onVerifyBatches(finalNewBatch, newStateRoot, msg.sender);
    }

    function getBatchFee() public view returns (uint256) {
        return 1;
    }

    function getForcedBatchFee() public view returns (uint256) {
        return 10;
    }
}
