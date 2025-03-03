#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
# Define cleanup function
cleanup() {
    sudo DEV_PERIOD=1 docker compose -f docker/docker-compose.yml down
}
# Configure "trap" in case there's an error
trap cleanup ERR

sudo rm -rf docker/gethData/geth_data
[ -f deployment/v2/create_rollup_output_* ] && rm ./deployment/v2/create_rollup_output_*
sudo DEV_PERIOD=1 docker compose -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
npm run deploy:testnet:v2:localhost
sudo rm -rf docker/deploymentOutput
mkdir docker/deploymentOutput
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output.json
cp ./docker/scripts/v2/create_rollup_parameters_docker-v0.2.0.json ./deployment/v2/create_rollup_parameters.json
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output_v0.2.0.json
cp ./docker/scripts/v2/create_rollup_parameters_docker-v0.3.0-ecdsa.json ./deployment/v2/create_rollup_parameters.json
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output_v0.3.0-ecdsa.json
sudo mv deployment/v2/deploy_output.json docker/deploymentOutput
sudo mv deployment/v2/genesis.json docker/deploymentOutput
[ -f deployment/v2/genesis_sovereign.json ] && sudo mv deployment/v2/genesis_sovereign.json docker/deploymentOutput
sudo DEV_PERIOD=1 docker compose -f docker/docker-compose.yml down
sudo docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData