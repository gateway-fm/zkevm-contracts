# VerifierRollupHelperMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/a8bf2955890e7123a84542ced57636d763299651/contracts/mocks/VerifierRollupHelperMock.sol)

**Inherits:**
[IVerifierRollup](/contracts/interfaces/IVerifierRollup.sol/interface.IVerifierRollup.md), [ISP1Verifier](/contracts/v2/interfaces/ISP1Verifier.sol/interface.ISP1Verifier.md)


## Functions
### verifyProof


```solidity
function verifyProof(bytes32[24] calldata proof, uint256[1] memory pubSignals) public pure override returns (bool);
```

### verifyProof


```solidity
function verifyProof(bytes32 programVKey, bytes calldata publicValues, bytes calldata proofBytes) public pure;
```

