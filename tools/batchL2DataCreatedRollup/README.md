# Generate BatchL2DataCreatedRollup
1. Copy configuration file:
```
cp input.json.example input.json
```

2. Set your parameters
```
{
    "networkID": 0,
    "bridgeAddress": "0x9b28F436039654F8b948dd32599032F684899cF0",
    "gasTokenAddress": "0x0000000000000000000000000000000000000000",
    "gasTokenNetwork": 0
}
```

3. Run `./generateBatchL2DataCreatedRollup.sh <network>`:
- Get information from network with `getData.ts` --> write `info.json`
```
npx hardhat run getData.ts --network <network>
```
- Generate tx with `batchL2DataCreatedRollup.ts` --> write `tx.json`
```
npx hardhat run batchL2DataCreatedRollup.ts
```

4. Output: `tx.json`