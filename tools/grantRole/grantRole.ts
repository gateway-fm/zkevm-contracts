/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers} from "hardhat";

const addRollupParameters = require("./grantRole.json");

const pathOutputJson = path.join(__dirname, "./grantRoleOutput.json");
import "../../deployment/helpers/utils";

async function main() {
    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        "roleName",
        "accountToGrantRole",
        "timelockDelay",
        "polygonRollupManagerAddress",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupParameters[parameterName] === undefined || addRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {roleName, accountToGrantRole, polygonRollupManagerAddress, timelockDelay} = addRollupParameters;
    const salt = addRollupParameters.timelockSalt || ethers.ZeroHash;

    const supportedRoles = [
        "ADD_ROLLUP_TYPE_ROLE",
        "OBSOLETE_ROLLUP_TYPE_ROLE",
        "CREATE_ROLLUP_ROLE",
        "ADD_EXISTING_ROLLUP_ROLE",
        "UPDATE_ROLLUP_ROLE",
        "TRUSTED_AGGREGATOR_ROLE",
        "TRUSTED_AGGREGATOR_ROLE_ADMIN",
        "SET_FEE_ROLE",
        "STOP_EMERGENCY_ROLE",
        "EMERGENCY_COUNCIL_ROLE",
    ];

    if (!supportedRoles.includes(roleName)) {
        throw new Error(`Role is not supported, supported roles are: ${supportedRoles}`);
    }
    const roleID = ethers.id(roleName);

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");

    // Load Rollup manager
    const PolgonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");

    const operation = genOperation(
        polygonRollupManagerAddress,
        0, // value
        PolgonRollupManagerFactory.interface.encodeFunctionData("grantRole", [roleID, accountToGrantRole]),
        ethers.ZeroHash, // predecesoor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
        timelockDelay,
    ]);
    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
    ]);

    console.log({scheduleData});
    console.log({executeData});

    outputJson.scheduleData = scheduleData;
    outputJson.executeData = executeData;

    // Decode the scheduleData for better readibility
    const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
    const paramsArray = timelockTx?.fragment.inputs as any;
    const objectDecoded = {} as any;

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "data") {
            const decodedRollupManagerData = PolgonRollupManagerFactory.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {} as any;
            const paramsArrayData = decodedRollupManagerData?.fragment.inputs as any;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedRollupManagerData?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }

    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

// OZ test functions
function genOperation(target: any, value: any, data: any, predecessor: any, salt: any) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "uint256", "bytes32"],
        [target, value, data, predecessor, salt]
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        target,
        value,
        data,
        predecessor,
        salt,
    };
}
