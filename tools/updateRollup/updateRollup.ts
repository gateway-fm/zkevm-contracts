/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, network} from "hardhat";

const updateRollupsParameters = require("./updateRollup.json");
const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./updateRollupOutput-${dateStr}.json`);
import {PolygonRollupManager} from "../../typechain-types";
import { transactionTypes, genOperation, loadProvider, decodeScheduleData } from "../utils";
import "../../deployment/helpers/utils";

async function main() {
    /*
     * Check parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "type",
        "polygonRollupManagerAddress",
    ];

    // check create rollup type
    switch (updateRollupsParameters.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryDeploymentParameters.push("timelockDelay");
            break;
        default:
            throw new Error(`Invalid type ${updateRollupsParameters.type}`);
    }

    for (const parameterName of mandatoryDeploymentParameters) {
        if (updateRollupsParameters[parameterName] === undefined || updateRollupsParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    console.log(`Starting script to update rollup from ${updateRollupsParameters.type}`)

    const currentProvider = loadProvider(updateRollupsParameters);

    // Load deployer
    let deployer;
    if (updateRollupsParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(updateRollupsParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("Using with: ", deployer.address);

    const { polygonRollupManagerAddress } =  updateRollupsParameters;
    
    // Load Rollup manager
    const PolgonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolgonRollupManagerFactory.attach(
        polygonRollupManagerAddress
    ) as PolygonRollupManager;

    const outputsJson = [] as any;

    // Timelock vars
    const operations = {} as any;
    operations.target = [];
    operations.value = [];
    operations.data = [];
    const predecessor = ethers.ZeroHash;
    const salt = updateRollupsParameters.timelockSalt || ethers.ZeroHash;

    if(updateRollupsParameters.rollups.length === 0) {
        throw new Error("No rollups")
    } else {
        for(let i = 0; i < updateRollupsParameters.rollups.length; i++) {
            const outputJson = {} as any;
            const updateRollupParameters = updateRollupsParameters.rollups[i];
            /*
             * Check parameters
             * Check that every necessary parameter is fullfilled
             */
            const mandatoryParametersRollup = [
                "rollupAddress",
                "newRollupTypeID",
                "upgradeData",
            ];
    
            for (const parameterName of mandatoryParametersRollup) {
                if (updateRollupParameters[parameterName] === undefined || updateRollupParameters[parameterName] === "") {
                    throw new Error(`Missing rollup[${i}] parameter: ${parameterName}`);
                }
            }
    
            const {rollupAddress, newRollupTypeID, upgradeData} = updateRollupParameters;
    
            outputJson.networkName = network.name;
            outputJson.polygonRollupManagerAddress = polygonRollupManagerAddress;
            outputJson.rollupAddress = rollupAddress;
            outputJson.newRollupTypeID = newRollupTypeID;
            outputJson.upgradeData = upgradeData;
    
            if(updateRollupsParameters.type === transactionTypes.EOA) {
                // Check role
                const UPDATE_ROLLUP_ROLE = ethers.id("UPDATE_ROLLUP_ROLE");
                if ((await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, deployer.address)) == false) {
                    // log that address has no role
                    throw new Error(`Address ${deployer.address} does not have the UPDATE_ROLLUP_ROLE role`);
                }
                console.log(`Updating rollup ${rollupAddress}...`)
                try {
                    console.log(await (await rollupManagerContract.updateRollup(rollupAddress, newRollupTypeID, upgradeData)).wait());
                    outputJson.successUpdate = true;
                } catch (e) {
                    outputJson.successUpdate = false;
                    console.log(`Error updating ${rollupAddress}`);
                }
                
            } else if(updateRollupsParameters.type === transactionTypes.TIMELOCK) {
                console.log(`Creating timelock txs for update rollup ${rollupAddress}...`)
                const operation = genOperation(
                    polygonRollupManagerAddress,
                    0, // value
                    PolgonRollupManagerFactory.interface.encodeFunctionData("updateRollup", [
                        rollupAddress,
                        newRollupTypeID,
                        upgradeData,
                    ]),
                    predecessor, // predecessor
                    salt // salt
                );
                operations.target.push(operation.target);
                operations.value.push(operation.value);
                operations.data.push(operation.data);
            } else {
                console.log(`Creating calldata for update rollup from multisig ${rollupAddress}...`);
                const txUpdateRollup = PolgonRollupManagerFactory.interface.encodeFunctionData("updateRollup", [
                    rollupAddress,
                    newRollupTypeID,
                    upgradeData,
                ]);
                outputJson.txUpdateRollup = txUpdateRollup;
            }
            outputsJson.push(outputJson);
        }
    
        // if type === Timelock --> get scheduleData & executeData
        if(updateRollupsParameters.type === transactionTypes.TIMELOCK){
            console.log(`Get scheduleData & executeData...`)
            const { timelockDelay } = updateRollupsParameters;
            // load timelock
            const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);
    
            // Schedule operation
            const scheduleData = timelockContractFactory.interface.encodeFunctionData("scheduleBatch", [
                operations.target,
                operations.value,
                operations.data,
                predecessor,
                salt,
                timelockDelay,
            ]);
    
            // Execute operation
            const executeData = timelockContractFactory.interface.encodeFunctionData("executeBatch", [
                operations.target,
                operations.value,
                operations.data,
                predecessor,
                salt,
            ]);
            
            console.log({scheduleData});
            console.log({executeData});

            const outputTimelock = {
                rollups: outputsJson,
                scheduleData,
                executeData,
                decodeScheduleData: decodeScheduleData(scheduleData, timelockContractFactory)
            }
            fs.writeFileSync(pathOutputJson, JSON.stringify(outputTimelock, null, 1));
        } else {
            fs.writeFileSync(pathOutputJson, JSON.stringify(outputsJson, null, 1));
        }

        console.log("Finished script, output saved at: ", pathOutputJson)

    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
