# Create sovereign genesis
Script to generate the genesis file for a rollup with `SovereignContracts`. This genesis si aim to be used for chains that are run with vanilla clients.
This script should be run after the rollup is created, so its `rollupID` and the bridge initialization parameters are known.
The script does the following:
- read base genesis file
- deploy sovereign cobtracts
- initialize them

## Setup
- install packages
```
npm i
```

- Set env variables
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID` and `ETHERSCAN_API_KEY`

- Copy configuration files:
```
cp ./tools/createSovereignGenesis/create-genesis-sovereign-params.json.example ./tools/createSovereignGenesis/create-genesis-sovereign-params.json
```

- Copy genesis base file:
```
cp ./tools/createSovereignGenesis/genesis-base.json.example ./tools/createSovereignGenesis/genesis-base.json
```

-  Set your parameters
  - `rollupManagerAddress`: `polygonRollupManager` smart contract address
  - `rollupID`: Rollup identifier. Assigned to a rollup when it is created in the contracts
  - `chainID`: ChainID of the rollup
  - `gasTokenAddress`: Address of the native gas token of the rollup, zero if ether
  - `bridgeManager`: bridge manager address
  - `sovereignWETHAddress`: sovereign WETH address
  - `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
  - `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains
  - `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains
  - `preMintAmount`: amount to be credited to `preMintAddress`
  - `preMintAddress`: ethereum address to receive `preMintAmount`
  - `timelockAdminAddress`: address that will have all timelocks roles (ADMIN, PROPOSER, CANCELLER, EXECUTOR)
  - `minDelayTimelock`: minimum delay set in the timelock smart contract

-  Run tool:
```
npx hardhat run ./tools/createSovereignGenesis/create-sovereign-genesis.ts --network sepolia
```

### More Info
- All commands are done from root repository
- The output files are:
  - `genesis-rollupID-${rollupID}__${timestamp}`: genesis file
  - `output-rollupID-${rollupID}__${timestamp}`: input parameters, gastokenAddress information and network used
- outputs are saved in the tool folder: `./tools/createSovereignGenesis`