import { ethers, network } from "hardhat";
import output from "./info.json";
import fs from "fs";

async function main() {
  const toolFactory = await ethers.getContractFactory("BatchL2DataCreatedRollup");
  const toolContract = await toolFactory.deploy();
  await toolContract.waitForDeployment()
  const txPath = "./tx.json"
  const tx = await toolContract.generateInitializeTransaction(output.networkID, output.bridgeAddress, output.gasTokenAddress, output.gasTokenNetwork, output.gasTokenMetadata)
  const outputTx = {
    networkID: output.networkID,
    tx: tx,
  }
  await fs.writeFileSync(txPath, JSON.stringify(outputTx, null, 1))
}

main().then(() => {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});