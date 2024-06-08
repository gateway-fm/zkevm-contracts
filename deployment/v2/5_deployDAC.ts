/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";
import {HardhatRuntimeEnvironment} from "hardhat/types";
const hre: HardhatRuntimeEnvironment = require("hardhat");

const {create2Deployment} = require("../helpers/deployment-helpers");

const pathOutputJson = path.join(__dirname, "./depoloy_dac_output.json");

const deployDacParameters = require("./deploy_dac_parameters.json");

import "../helpers/utils";

import {
    PolygonRollupManager,
    PolygonZkEVMV2,
    PolygonZkEVMBridgeV2,
    PolygonValidium,
    PolygonValidiumEtrog,
} from "../../typechain-types";

async function main() {
    const attemptsDeployProxy = 20;

    const outputJson = {} as any;

    // Load provider
    let currentProvider = ethers.provider;
    if (deployDacParameters.multiplierGas || deployDacParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            const networkName = hre.network.name;
            const networkConfig = hre.config.networks[networkName];
            currentProvider = ethers.getDefaultProvider((networkConfig as any).url) as any;
            if (deployDacParameters.maxPriorityFeePerGas && deployDacParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${deployDacParameters.maxPriorityFeePerGas} gwei, MaxFee${deployDacParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(deployDacParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(deployDacParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", deployDacParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(deployDacParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(deployDacParameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (deployDacParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(deployDacParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    deployer = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase(process.env.MNEMONIC!),
        "m/44'/60'/0'/0/0"
    ).connect(currentProvider);

    // deploy data commitee
    const PolygonDataCommitteeContract = (await ethers.getContractFactory("PolygonDataCommittee", deployer)) as any;
    let polygonDataCommittee;

    for (let i = 0; i < attemptsDeployProxy; i++) {
        try {
            polygonDataCommittee = await upgrades.deployProxy(PolygonDataCommitteeContract, [], {
                unsafeAllow: ["constructor"],
            });
            break;
        } catch (error: any) {
            console.log(`attempt ${i}`);
            console.log("upgrades.deployProxy of polygonDataCommittee ", error.message);
        }
        // reach limits of attempts
        if (i + 1 === attemptsDeployProxy) {
            throw new Error("polygonDataCommittee contract has not been deployed");
        }
    }
    await polygonDataCommittee?.waitForDeployment();

    console.log("polygonDataCommittee deployed at ", polygonDataCommittee?.target);

    outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
