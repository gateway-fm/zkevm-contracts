# IPolygonRollupBasePrevious
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/a8bf2955890e7123a84542ced57636d763299651/contracts/v2/previousVersions/IPolygonRollupBasePrevious.sol)


## Functions
### initialize


```solidity
function initialize(
    address _admin,
    address sequencer,
    uint32 networkID,
    address gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName
) external;
```

### onVerifyBatches


```solidity
function onVerifyBatches(uint64 lastVerifiedBatch, bytes32 newStateRoot, address aggregator) external;
```

### admin


```solidity
function admin() external returns (address);
```

