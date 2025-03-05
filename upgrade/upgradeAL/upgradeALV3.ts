/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from "chai";
import path = require("path");
import fs = require("fs");
import { utils } from "ffjavascript";

import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { ethers, upgrades } from "hardhat";
import { PolygonRollupManagerPessimistic } from "../../typechain-types";
import { genTimelockOperation, verifyContractEtherscan, decodeScheduleData } from "../utils";
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from "../../src/utils";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ["rollupManagerAddress", "aggLayerGatewayAddress", "timelockDelay"];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { rollupManagerAddress, timelockDelay, aggLayerGatewayAddress } = upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load onchain parameters
    let polygonRMPreviousFactory = await ethers.getContractFactory("PolygonRollupManagerPessimistic");
    const rollupManagerPessimisticContract = (await polygonRMPreviousFactory.attach(
        rollupManagerAddress
    )) as PolygonRollupManagerPessimistic;

    const globalExitRootManagerAddress = await rollupManagerPessimisticContract.globalExitRootManager();
    const polAddress = await rollupManagerPessimisticContract.pol();
    const bridgeAddress = await rollupManagerPessimisticContract.bridgeAddress();

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    console.log("deploying implementation with: ", deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(rollupManagerAddress as string)).to.be.equal(proxyAdmin.target);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // prepare upgrades

    // Upgrade to rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, PolygonRollupManagerFactory, {
        constructorArgs: [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress],
        unsafeAllow: ["constructor"],
    });

    console.log("#######################\n");
    console.log(`Polygon rollup manager: ${implRollupManager}`);
    await verifyContractEtherscan(implRollupManager as string, [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress]);

    const operationRollupManager = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            rollupManagerAddress,
            implRollupManager,
            PolygonRollupManagerFactory.interface.encodeFunctionData("initialize", []),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operationRollupManager.target,
        operationRollupManager.value,
        operationRollupManager.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operationRollupManager.target,
        operationRollupManager.value,
        operationRollupManager.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    console.log({ scheduleData });
    console.log({ executeData });
    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    const outputJson = {
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
    };

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);


    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
