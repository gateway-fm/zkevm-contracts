# IPolygonRollupBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/a8bf2955890e7123a84542ced57636d763299651/contracts/v2/interfaces/IPolygonRollupBase.sol)

**Inherits:**
[IPolygonConsensusBase](/contracts/v2/interfaces/IPolygonConsensusBase.sol/interface.IPolygonConsensusBase.md)


## Functions
### onVerifyBatches


```solidity
function onVerifyBatches(uint64 lastVerifiedBatch, bytes32 newStateRoot, address aggregator) external;
```

### rollbackBatches


```solidity
function rollbackBatches(uint64 targetBatch, bytes32 accInputHashToRollback) external;
```

