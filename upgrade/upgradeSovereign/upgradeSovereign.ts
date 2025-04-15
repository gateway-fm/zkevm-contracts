/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from "chai";
import path = require("path");
import fs = require("fs");
import { utils } from "ffjavascript";
import { logger } from "../../src/logger";

import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { ethers, upgrades, run } from "hardhat";
import { GlobalExitRootManagerL2SovereignChainPessimistic } from "../../typechain-types";
import { genTimelockOperation } from "../utils";
import { checkParams, getDeployerFromParameters } from "../../src/utils";

const pathOutputJson = path.join(__dirname, "./upgrade_output.json");

const upgradeParameters = require("./upgrade_parameters.json");

async function main() {
    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ["timelockDelay", "proxiedTokensManagerAddress", "emergencyBridgePauserAddress"];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { timelockDelay, emergencyBridgePauserAddress, proxiedTokensManagerAddress } = upgradeParameters;

    // In case globalExitRootManagerL2SovereignChainAddress is not provided, use the default one, used by most chains in the genesis
    const globalExitRootManagerL2SovereignChainAddress = typeof upgradeParameters.globalExitRootManagerL2SovereignChainAddress === "undefined" ? "0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa" : upgradeParameters.globalExitRootManagerL2SovereignChainAddress;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load onchain parameters
    const gerManagerL2SovereignChainPessimisticFactory = await ethers.getContractFactory(
        "GlobalExitRootManagerL2SovereignChainPessimistic"
    );
    const gerManagerL2SovereignChainContract = (await gerManagerL2SovereignChainPessimisticFactory.attach(
        globalExitRootManagerL2SovereignChainAddress
    )) as GlobalExitRootManagerL2SovereignChainPessimistic;

    const bridgeAddress = await gerManagerL2SovereignChainContract.bridgeAddress();

    // Load deployer
    const deployer = await getDeployerFromParameters(ethers.provider, upgradeParameters, ethers);
    logger.info(`Upgrading with: ${deployer.address}`);

    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    await upgrades.forceImport(
        globalExitRootManagerL2SovereignChainAddress,
        gerManagerL2SovereignChainPessimisticFactory,
        {
            constructorArgs: [bridgeAddress],
            kind: "transparent",
        }
    );

    const proxyAdmin = await upgrades.admin.getInstance();
    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(globalExitRootManagerL2SovereignChainAddress as string)).to.be.equal(proxyAdmin.target);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // prepare upgrades
    // Upgrade to GlobalExitRootManagerL2SovereignChain
    const gerManagerL2SovereignChainFactory = await ethers.getContractFactory("GlobalExitRootManagerL2SovereignChain", deployer);
    const gerManagerL2SovereignChainImplementation = await upgrades.prepareUpgrade(
        globalExitRootManagerL2SovereignChainAddress,
        gerManagerL2SovereignChainFactory,
        {
            constructorArgs: [bridgeAddress],
            unsafeAllow: ["constructor"],
        }
    );

    logger.info("#######################\n");
    logger.info(`GERManagerL2Sovereign implementation: ${gerManagerL2SovereignChainImplementation}`);
    try {
        logger.info("Trying to verify the new implementation contract");
        // wait a few seconds before trying etherscan verification
        await new Promise((r) => setTimeout(r, 5000));
        // verify
        await run("verify:verify", {
            address: gerManagerL2SovereignChainImplementation,
            constructorArguments: [bridgeAddress],
        });
    } catch (error) {
        logger.info("Error verifying the new implementation contract: ", error);
        logger.info("you can verify the new impl address with:");
        logger.info(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${gerManagerL2SovereignChainImplementation} --network ${process.env.HARDHAT_NETWORK}\n`
        );
        logger.info("Copy the following constructor arguments on: upgrade/arguments.js \n", [bridgeAddress]);
    }
    // gerManagerL2SovereignChainImplementation is upgraded but not initialized
    const operationGER = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgrade", [
            globalExitRootManagerL2SovereignChainAddress,
            gerManagerL2SovereignChainImplementation,
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Upgrade BridgeL2SovereignChain
    const bridgeFactory = await ethers.getContractFactory("BridgeL2SovereignChain", deployer);
    const impBridge = await upgrades.prepareUpgrade(bridgeAddress, bridgeFactory, {
        unsafeAllow: ["constructor", "missing-initializer", "missing-initializer-call"],
    });
    logger.info("#######################\n");
    logger.info(`Polygon sovereign bridge implementation deployed at: ${impBridge}`);

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [
            bridgeAddress,
            impBridge,
            bridgeFactory.interface.encodeFunctionData("initialize(address)", [[],[],emergencyBridgePauserAddress, proxiedTokensManagerAddress])
        ]), // data
        ethers.ZeroHash, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("scheduleBatch", [
        [operationGER.target, operationBridge.target],
        [operationGER.value, operationBridge.value],
        [operationGER.data, operationBridge.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("executeBatch", [
        [operationGER.target, operationBridge.target],
        [operationGER.value, operationBridge.value],
        [operationGER.data, operationBridge.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    const outputJson = {
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
    };

    // Decode the scheduleData for better readability
    const timelockTx = timelockContractFactory.interface.parseTransaction({ data: scheduleData });
    const paramsArray = timelockTx?.fragment.inputs as any;
    const objectDecoded = {} as any;

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "data") {
            const decodedProxyAdmin = proxyAdmin.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {} as any;
            const paramsArrayData = decodedProxyAdmin?.fragment.inputs as any;

            objectDecodedData.signature = decodedProxyAdmin?.signature;
            objectDecodedData.selector = decodedProxyAdmin?.selector;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedProxyAdmin?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }

    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 1));
    logger.info(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
