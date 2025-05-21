# IAggchainBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/a8bf2955890e7123a84542ced57636d763299651/contracts/v2/interfaces/IAggchainBase.sol)

**Inherits:**
[IAggchainBaseErrors](/contracts/v2/interfaces/IAggchainBase.sol/interface.IAggchainBaseErrors.md), [IAggchainBaseEvents](/contracts/v2/interfaces/IAggchainBase.sol/interface.IAggchainBaseEvents.md)

Shared interface for native aggchain implementations.


## Functions
### getAggchainHash

Gets aggchain hash.

*Each chain should properly manage its own aggchain hash.*


```solidity
function getAggchainHash(bytes calldata aggchainData) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data to build the consensus hash.|


### onVerifyPessimistic

Callback from the PolygonRollupManager to update the chain's state.

*Each chain should properly manage its own state.*


```solidity
function onVerifyPessimistic(bytes calldata aggchainData) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data to update chain's state|


### initAggchainManager

Sets the aggchain manager.


```solidity
function initAggchainManager(address newAggchainManager) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainManager`|`address`|The address of the new aggchain manager.|


### AGGCHAIN_TYPE

Returns the unique aggchain type identifier.


```solidity
function AGGCHAIN_TYPE() external view returns (bytes2);
```

