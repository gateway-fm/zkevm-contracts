


## Functions
### generateInitializeTransaction
```solidity
  function generateInitializeTransaction(
    uint32 networkID,
    address bridgeAddress,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    bytes _gasTokenMetadata
  ) public returns (bytes)
```
Generate Initialize transaction for hte bridge on L2


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`networkID` | uint32 | Indicates the network identifier that will be used in the bridge
|`bridgeAddress` | address | Indicates the bridge address
|`_gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
|`_gasTokenNetwork` | uint32 | Indicates the native network of the token address
|`_gasTokenMetadata` | bytes | Abi encoded gas token metadata

