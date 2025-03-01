Contract responsible for managing the exit roots for the Sovereign chains and global exit roots


## Functions
### constructor
```solidity
  function constructor(
    address _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_bridgeAddress` | address | PolygonZkEVMBridge contract address

### initialize
```solidity
  function initialize(
    address _globalExitRootUpdater,
    address _globalExitRootRemover
  ) external
```
Initialize contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootUpdater` | address | setting the globalExitRootUpdater.
|`_globalExitRootRemover` | address | In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim and go back and the execution would be correctly proved.

### insertGlobalExitRoot
```solidity
  function insertGlobalExitRoot(
    bytes32 _newRoot
  ) external
```
Insert a new global exit root


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_newRoot` | bytes32 | new global exit root to insert

### removeLastGlobalExitRoots
```solidity
  function removeLastGlobalExitRoots(
    bytes32[] gersToRemove
  ) external
```
Remove last global exit roots


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`gersToRemove` | bytes32[] | Array of gers to remove in inserted order where first element of the array is the last inserted

### setGlobalExitRootUpdater
```solidity
  function setGlobalExitRootUpdater(
    address _globalExitRootUpdater
  ) external
```
Set the globalExitRootUpdater


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootUpdater` | address | new globalExitRootUpdater address

### setGlobalExitRootRemover
```solidity
  function setGlobalExitRootRemover(
    address _globalExitRootRemover
  ) external
```
Set the globalExitRootRemover


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootRemover` | address | new globalExitRootRemover address

## Events
### InsertGlobalExitRoot
```solidity
  event InsertGlobalExitRoot(
  )
```

Emitted when a new global exit root is inserted

### RemoveLastGlobalExitRoot
```solidity
  event RemoveLastGlobalExitRoot(
  )
```

Emitted when the last global exit root is removed

### SetGlobalExitRootUpdater
```solidity
  event SetGlobalExitRootUpdater(
  )
```

Emitted when the globalExitRootUpdater is set

### SetGlobalExitRootRemover
```solidity
  event SetGlobalExitRootRemover(
  )
```

Emitted when the globalExitRootRemover is set

