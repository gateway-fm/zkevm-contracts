/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, run} from "hardhat";

const addRollupTypeParameters = require("./add_rollup_type.json");
const genesis = require("./genesis.json");

const dateStr = new Date().toISOString();
const pathOutputJson = addRollupTypeParameters.outputPath
    ? path.join(__dirname, addRollupTypeParameters.outputPath)
    : path.join(__dirname, `./add_rollup_type_output-${dateStr}.json`);
import "../../deployment/helpers/utils";
import {supportedBridgeContracts} from "../utils";

async function main() {
    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = [
        "description",
        "forkID",
        "consensusContract",
        "verifierAddress",
        "timelockDelay",
        "genesisRoot",
        "programVKey",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (addRollupTypeParameters[parameterName] === undefined || addRollupTypeParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        description,
        forkID,
        consensusContract,
        polygonRollupManagerAddress,
        verifierAddress,
        timelockDelay,
        genesisRoot,
        programVKey,
    } = addRollupTypeParameters;

    const salt = addRollupTypeParameters.timelockSalt || ethers.ZeroHash;
    const predecessor = addRollupTypeParameters.predecessor || ethers.ZeroHash;

    const supportedConsensus = [
        "PolygonZkEVMEtrog",
        "PolygonValidiumEtrog",
        "PolygonValidiumStorageMigration",
        "PolygonPessimisticConsensus",
    ];
    const isPessimistic = consensusContract === "PolygonPessimisticConsensus";

    if (!supportedConsensus.includes(consensusContract)) {
        throw new Error(`Consensus contract not supported, supported contracts are: ${supportedConsensus}`);
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (addRollupTypeParameters.multiplierGas || addRollupTypeParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (addRollupTypeParameters.maxPriorityFeePerGas && addRollupTypeParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${addRollupTypeParameters.maxPriorityFeePerGas} gwei, MaxFee${addRollupTypeParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(addRollupTypeParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(addRollupTypeParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", addRollupTypeParameters.multiplierGas);
                async function overrideFeeData() {
                    const feeData = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feeData.maxFeePerGas as bigint) * BigInt(addRollupTypeParameters.multiplierGas)) / 1000n,
                        ((feeData.maxPriorityFeePerGas as bigint) * BigInt(addRollupTypeParameters.multiplierGas)) /
                            1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (addRollupTypeParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(addRollupTypeParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    console.log("Using with: ", deployer.address);

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        polygonRollupManagerAddress
    ) as PolygonRollupManager;

    // get data from rollupManagerContract
    const polygonZkEVMBridgeAddress = await rollupManagerContract.bridgeAddress();
    const polygonZkEVMGlobalExitRootAddress = await rollupManagerContract.globalExitRootManager();
    const polTokenAddress = await rollupManagerContract.pol();

    if (!isPessimistic) {
        // checks for rollups
        // Sanity checks genesisRoot
        if (genesisRoot !== genesis.root) {
            throw new Error(`Genesis root in the 'add_rollup_type.json' does not match the root in the 'genesis.json'`);
        }

        // get bridge address in genesis file
        let genesisBridgeAddress = ethers.ZeroAddress;
        let bridgeContractName = "";
        for (let i = 0; i < genesis.genesis.length; i++) {
            if (supportedBridgeContracts.includes(genesis.genesis[i].contractName)) {
                genesisBridgeAddress = genesis.genesis[i].address;
                bridgeContractName = genesis.genesis[i].contractName;
                break;
            }
        }

        if (polygonZkEVMBridgeAddress.toLowerCase() !== genesisBridgeAddress.toLowerCase()) {
            throw new Error(
                `'${bridgeContractName}' root in the 'genesis.json' does not match 'bridgeAddress' in the 'PolygonRollupManager'`
            );
        }
    }

    // Create consensus implementation if needed
    const PolygonConsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
    let PolygonConsensusContract;
    let PolygonConsensusContractAddress;

    if (
        typeof addRollupTypeParameters.consensusContractAddress !== "undefined" &&
        ethers.isAddress(addRollupTypeParameters.consensusContractAddress)
    ) {
        PolygonConsensusContractAddress = addRollupTypeParameters.consensusContractAddress;
    } else {
        PolygonConsensusContract = await PolygonConsensusFactory.deploy(
            polygonZkEVMGlobalExitRootAddress,
            polTokenAddress,
            polygonZkEVMBridgeAddress,
            polygonRollupManagerAddress
        );
        await PolygonConsensusContract.waitForDeployment();

        PolygonConsensusContractAddress = PolygonConsensusContract.target;

        console.log("#######################\n");
        console.log(`new consensus name: ${consensusContract}`);
        console.log(`new PolygonConsensusContract impl: ${PolygonConsensusContractAddress}`);

        try {
            console.log("Verifying contract...");
            await run("verify:verify", {
                address: PolygonConsensusContract.target,
                constructorArguments: [
                    polygonZkEVMGlobalExitRootAddress,
                    polTokenAddress,
                    polygonZkEVMBridgeAddress,
                    polygonRollupManagerAddress,
                ],
            });
        } catch (e) {
            console.log("Automatic verification failed. Please verify the contract manually.");
            console.log("you can verify the new impl address with:");
            console.log(
                `npx hardhat verify --constructor-args upgrade/arguments.js ${PolygonConsensusContract.target} --network ${process.env.HARDHAT_NETWORK}\n`
            );
            console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [
                polygonZkEVMGlobalExitRootAddress,
                polTokenAddress,
                polygonZkEVMBridgeAddress,
                polygonRollupManagerAddress,
            ]);
        }
    }

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);

    // Add a new rollup type
    let rollupVerifierType;
    let genesisFinal;
    let programVKeyFinal;

    if (consensusContract == "PolygonPessimisticConsensus") {
        rollupVerifierType = 1;
        genesisFinal = ethers.ZeroHash;
        programVKeyFinal = programVKey || ethers.ZeroHash;
    } else {
        rollupVerifierType = 0;
        genesisFinal = genesis.root;
        programVKeyFinal = ethers.ZeroHash;
    }

    const operation = genOperation(
        polygonRollupManagerAddress,
        0, // value
        PolygonRollupManagerFactory.interface.encodeFunctionData("addNewRollupType", [
            PolygonConsensusContractAddress,
            verifierAddress,
            forkID,
            rollupVerifierType,
            genesisFinal,
            description,
            programVKeyFinal,
        ]),
        predecessor, // predecessor
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

    outputJson.genesis = genesis.root;
    outputJson.verifierAddress = verifierAddress;
    outputJson.consensusContract = consensusContract;
    outputJson.scheduleData = scheduleData;
    outputJson.executeData = executeData;
    outputJson.id = operation.id;

    // Decode the scheduleData for better readability
    const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
    const paramsArray = timelockTx?.fragment.inputs;
    const objectDecoded = {};

    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];

        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "data") {
            const decodedRollupManagerData = PolygonRollupManagerFactory.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {};
            const paramsArrayData = decodedRollupManagerData?.fragment.inputs;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedRollupManagerData?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }

    outputJson.decodedScheduleData = objectDecoded;

    // Decode the schedule data to better readability:

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
