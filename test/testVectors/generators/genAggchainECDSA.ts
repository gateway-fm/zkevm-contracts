import {ethers, upgrades} from "hardhat";
import {Address, AggchainECDSA} from "../../../typechain-types";
import {expect} from "chai";
import fs = require("fs");

const dataECDSA = require("../data/aggchainECDSA.json");
const utilsECDSA = require("../../../src/utils-aggchain-ECDSA");
const pathTestVector = "../finalData/aggchainECDSA.json";

// SIGNERS
let admin: any;
let vKeyManager: any;
let aggchainECDSAContract: AggchainECDSA;

const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;
const aggLayerGatewayAddress = "0xE00000000000000000000000000000000000000E" as unknown as Address;

async function main() {
    let initializeBytesCustomChain: string;
    let customChainData: string;
    let aggchainConfig: string;
    let aggchainVKeySelector: string;
    let aggchainHash: string;

    for (let i = 0; i < dataECDSA.length; i++) {
        const data = dataECDSA[i];

        it(`generate id: ${i}`, async function () {
            // load signers
            [vKeyManager, admin] = await ethers.getSigners();

            // deploy aggchain
            // create aggchainECDSA implementation
            const aggchainECDSAFactory = await ethers.getContractFactory("AggchainECDSA");
            aggchainECDSAContract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
                initializer: false,
                constructorArgs: [
                    gerManagerAddress,
                    polTokenAddress,
                    bridgeAddress,
                    rollupManagerAddress,
                    aggLayerGatewayAddress,
                ],
                unsafeAllow: ["constructor", "state-variable-immutable"],
            });
            await aggchainECDSAContract.waitForDeployment();

            // encode initializeBytesCustomChain
            initializeBytesCustomChain = utilsECDSA.encodeInitializeBytesCustomChain(
                admin.address,
                data.trustedSequencer,
                data.gasTokenAddress,
                data.trustedSequencerURL,
                data.networkName,
                vKeyManager.address
            );

            // initialize using rollup manager & initializeBytesCustomChain
            await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
            const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
            await aggchainECDSAContract
                .connect(rollupManagerSigner)
                .initialize(initializeBytesCustomChain, {gasPrice: 0});

            // check initializeBytesCustomChain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);

            // encode customChainData
            customChainData = utilsECDSA.encodeCustomChainData(data.aggchainSelector, data.newStateRoot);

            // encode aggchainConfig
            aggchainConfig = utilsECDSA.aggchainConfig(data.trustedSequencer);

            // get aggchainVKeySelector
            aggchainVKeySelector = utilsECDSA.getFinalAggchainSelector(data.aggchainSelector);

            // check aggchainVKeySelector
            expect(aggchainVKeySelector).to.be.equal(
                utilsECDSA.AGGCHAIN_TYPE_SELECTOR_ECDSA + data.aggchainSelector.slice(2)
            );

            // get aggchainHash
            aggchainHash = utilsECDSA.getAggchainHash(data.aggchainVkey, aggchainConfig);

            // add aggchainVKey to check aggchainHash
            await expect(aggchainECDSAContract.connect(vKeyManager).disableUseDefaultGatewayFlag())
                .to.emit(aggchainECDSAContract, "UpdateUseDefaultGatewayFlag")
                .withArgs(false);

            await expect(
                aggchainECDSAContract.connect(vKeyManager).addOwnedAggchainVKey(aggchainVKeySelector, data.aggchainVkey)
            )
                .to.emit(aggchainECDSAContract, "AddAggchainVKey")
                .withArgs(aggchainVKeySelector, data.aggchainVkey);

            // get aggchainHash from contract
            const aggchainHashContract = await aggchainECDSAContract.getAggchainHash(customChainData, {gasPrice: 0});

            // check aggchainHash === aggchainHash from contract
            // with this check we can be sure that the aggchainConfig & aggchainHash works correctly
            expect(aggchainHash).to.be.equal(aggchainHashContract);

            // add data to test-vector
            data.vKeyManager = vKeyManager.address;
            data.admin = admin.address;
            data.initializeBytesCustomChain = initializeBytesCustomChain;
            data.customChainData = customChainData;
            data.aggchainVKeySelector = aggchainVKeySelector;
            data.aggchainHash = aggchainHash;

            console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
            await fs.writeFileSync(pathTestVector, JSON.stringify(dataECDSA, null, 2));
        });
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
