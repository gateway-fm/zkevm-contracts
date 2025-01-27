/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
// external dependencies
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, hardhatArguments} from "hardhat";

// internal dependencies
import updateVanillaGenesis from "../../deployment/v2/utils/updateVanillaGenesis";
import { PolygonRollupManager, PolygonZkEVMBridgeV2} from "../../typechain-types";
import "../../deployment/helpers/utils";

// script utils
const dateStr = new Date().toISOString();

// read files
const genesisBase = require("./genesis-base.json");
const createGenesisSovereignParams = require("./create-genesis-sovereign-params.json");

async function main() {
    // check tool parameters
    const mandatoryParameters = [
        "rollupManagerAddress",
        "rollupID",
        "chainID",
        "bridgeManager",
        "gasTokenAddress",
        "sovereignWETHAddress",
        "sovereignWETHAddressIsNotMintable",
        "globalExitRootUpdater",
        "globalExitRootRemover"
    ];

    for (const parameterName of mandatoryParameters) {
        if (createGenesisSovereignParams[parameterName] === undefined || createGenesisSovereignParams[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    // Load provider
    const currentProvider = ethers.provider;

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        createGenesisSovereignParams.rollupManagerAddress
    ) as PolygonRollupManager;

    // Checks like in bridge contract
    if (
        ethers.isAddress(createGenesisSovereignParams.gasTokenAddress) &&
        createGenesisSovereignParams.gasTokenAddress !== ethers.ZeroAddress &&
        createGenesisSovereignParams.sovereignWETHAddress === ethers.ZeroAddress &&
        createGenesisSovereignParams.sovereignWETHAddressIsNotMintable === true
    ) {
        throw new Error(
            "InvalidSovereignWETHAddressParams: if gasTokenAddress is not 0x0, and sovereignWETHAddress is 0x0, sovereignWETHAddressIsNotMintable must be false"
        );
    }

    if (
        createGenesisSovereignParams.gasTokenAddress === ethers.ZeroAddress &&
        (createGenesisSovereignParams.sovereignWETHAddress !== ethers.ZeroAddress ||
            createGenesisSovereignParams.sovereignWETHAddressIsNotMintable === true)
    ) {
        throw new Error(
            "InvalidSovereignWETHAddressParams: If gasTokenAddress is 0x0, sovereignWETHAddress must be 0x0 and sovereignWETHAddressIsNotMintable must be false"
        );
    }

    // Create output
    const outputJson = {} as any;

    // get token information
    let gasTokenAddress, gasTokenNetwork, gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
    const bridgeContractAddress = await rollupManagerContract.bridgeAddress();
    const rollupBridgeContract = bridgeFactory.attach(bridgeContractAddress) as PolygonZkEVMBridgeV2;
    if (
        ethers.isAddress(createGenesisSovereignParams.gasTokenAddress) &&
        createGenesisSovereignParams.gasTokenAddress !== ethers.ZeroAddress
    ) {
        // Get token metadata
        gasTokenMetadata = await rollupBridgeContract.getTokenMetadata(createGenesisSovereignParams.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes("124e4f545f56414c49445f454e434f44494e47")) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createGenesisSovereignParams.gasTokenAddress}`
            );
        }
        const wrappedData = await rollupBridgeContract.wrappedTokenToTokenInfo(createGenesisSovereignParams.gasTokenAddress);
        if (wrappedData.originNetwork != 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createGenesisSovereignParams.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = "0x";
    }


    // start final genesis creation
    let finalGenesis = genesisBase;

    // initialize sovereign bridge parameters
    const initializeParams = {
        rollupID: createGenesisSovereignParams.rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        polygonRollupManager: ethers.ZeroAddress,
        gasTokenMetadata,
        bridgeManager: createGenesisSovereignParams.bridgeManager,
        sovereignWETHAddress: createGenesisSovereignParams.sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable: createGenesisSovereignParams.sovereignWETHAddressIsNotMintable,
        globalExitRootUpdater: createGenesisSovereignParams.globalExitRootUpdater,
        globalExitRootRemover: createGenesisSovereignParams.globalExitRootRemover,
    };

    finalGenesis = await updateVanillaGenesis(finalGenesis, createGenesisSovereignParams.chainID, initializeParams);

    // Add weth address to deployment output if gas token address is provided and sovereignWETHAddress is not provided
    let outWETHAddress;
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (createGenesisSovereignParams.sovereignWETHAddress === ethers.ZeroAddress ||
            !ethers.isAddress(createGenesisSovereignParams.sovereignWETHAddress))
    ) {
        console.log("Rollup with custom gas token, adding WETH address to deployment output...");
        const wethObject = genesisBase.genesis.find(function (obj: {contractName: string}) {
            return obj.contractName == "WETH";
        });
        outWETHAddress = wethObject.address;
    }

    // Populate final output
    outputJson.network = hardhatArguments.network;
    outputJson.rollupID = createGenesisSovereignParams.rollupID;
    outputJson.gasTokenAddress = gasTokenAddress;
    outputJson.gasTokenNetwork = gasTokenNetwork;
    outputJson.gasTokenMetadata = gasTokenMetadata;
    outputJson.rollupManagerAddress = createGenesisSovereignParams.rollupManagerAddress;
    outputJson.chainID = createGenesisSovereignParams.chainID;
    outputJson.bridgeManager = createGenesisSovereignParams.bridgeManager;
    outputJson.sovereignWETHAddress = createGenesisSovereignParams.sovereignWETHAddress;
    outputJson.sovereignWETHAddressIsNotMintable = createGenesisSovereignParams.sovereignWETHAddressIsNotMintable;
    outputJson.globalExitRootUpdater = createGenesisSovereignParams.globalExitRootUpdater;
    outputJson.globalExitRootRemover = createGenesisSovereignParams.globalExitRootRemover;

    if (typeof outWETHAddress !== 'undefined') {
        outputJson.WETHAddress = outWETHAddress;
    }

    // path output genesis
    const pathOutputGenesisJson = createGenesisSovereignParams.outputGenesisPath
    ? path.join(__dirname, createGenesisSovereignParams.outputGenesisPath)
    : path.join(__dirname, `./genesis-rollupID-${createGenesisSovereignParams.rollupID}__${dateStr}.json`);

    const pathOutputJson = createGenesisSovereignParams.outputPath
    ? path.join(__dirname, createGenesisSovereignParams.outputPath)
    : path.join(__dirname, `./output-rollupID-${createGenesisSovereignParams.rollupID}__${dateStr}.json`);

    // write files
    fs.writeFileSync(pathOutputGenesisJson, JSON.stringify(finalGenesis, null, 1));
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    console.log("Output saved at:");
    console.log(`   output genesis: ${pathOutputGenesisJson}`);
    console.log(`   output info   : ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
