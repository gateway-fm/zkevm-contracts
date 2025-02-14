import {ethers, upgrades} from "hardhat";
import {Address, AggchainFEP} from "../../../typechain-types";
import {expect} from "chai";
import fs = require("fs");

const dataFEP = require("../data/aggchainFEP.json");
const utilsFEP = require("../../../src/utils-aggchain-FEP");
const pathTestVector = "../finalData/aggchainFEP.json";

// SIGNERS
let admin: any;
let vKeyManager: any;
let aggchainFEPContract: AggchainFEP;

const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;
const aggLayerGatewayAddress = "0xE00000000000000000000000000000000000000E" as unknown as Address;

async function main() {
    let initializeBytesCustomChainV0: string;
    let initializeBytesCustomChainV1: string;
    let customChainData: string;
    let aggchainConfig: string;
    let aggchainVKeySelector: string;
    let aggchainHash: string;

    for (let i = 0; i < dataFEP.length; i++) {
        const data = dataFEP[i];

        it(`generate id: ${i}`, async function () {
            // load signers
            [vKeyManager, admin] = await ethers.getSigners();

            // deploy aggchain
            // create aggchainECDSA implementation
            const aggchainFEPFactory = await ethers.getContractFactory("AggchainFEP");
            aggchainFEPContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
                initializer: false,
                constructorArgs: [
                    gerManagerAddress,
                    polTokenAddress,
                    bridgeAddress,
                    rollupManagerAddress,
                    aggLayerGatewayAddress,
                ],
                unsafeAllow: [
                    "constructor",
                    "state-variable-immutable",
                    "missing-initializer",
                    "missing-initializer-call",
                ],
            });
            await aggchainFEPContract.waitForDeployment();

            // encode initializeBytesCustomChain version 0
            initializeBytesCustomChainV0 = utilsFEP.encodeInitializeBytesCustomChainv0(
                admin.address,
                data.trustedSequencer,
                data.gasTokenAddress,
                data.trustedSequencerURL,
                data.networkName,
                data.aggregationVkey,
                data.chainConfigHash,
                data.rangeVkeyCommitment,
                data.initStateRoot,
                data.initTimestamp,
                data.initL2BlockNumber,
                vKeyManager.address
            );

            // initialize using rollup manager & initializeBytesCustomChainV0
            await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
            const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
            await aggchainFEPContract
                .connect(rollupManagerSigner)
                .initialize(initializeBytesCustomChainV0, {gasPrice: 0});

            // check initializeBytesCustomChain
            expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
            expect(await aggchainFEPContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainFEPContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            expect(await aggchainFEPContract.aggregationVkey()).to.be.equal(data.aggregationVkey);
            expect(await aggchainFEPContract.chainConfigHash()).to.be.equal(data.chainConfigHash);
            expect(await aggchainFEPContract.rangeVkeyCommitment()).to.be.equal(data.rangeVkeyCommitment);
            const chainData = await aggchainFEPContract.chainData(0);
            expect(chainData[0]).to.be.equal(data.initStateRoot);
            expect(chainData[1]).to.be.equal(data.initTimestamp);
            expect(chainData[2]).to.be.equal(data.initL2BlockNumber);

            // encode initializeBytesCustomChain version 1
            initializeBytesCustomChainV1 = utilsFEP.encodeInitializeBytesCustomChainv1(
                data.aggregationVkey,
                data.chainConfigHash,
                data.rangeVkeyCommitment,
                data.initStateRoot,
                data.initTimestamp,
                data.initL2BlockNumber
            );

            // // reinitialize using rollup manager & initializeBytesCustomChainV1
            // aggchainFEPContract = await upgrades.upgradeProxy(aggchainFEPContract.target, aggchainFEPFactory, {
            //     constructorArgs: [
            //         gerManagerAddress,
            //         polTokenAddress,
            //         bridgeAddress,
            //         rollupManagerAddress,
            //         aggLayerGatewayAddress,
            //     ],
            //     unsafeAllow: [
            //         "constructor",
            //         "state-variable-immutable",
            //         "enum-definition",
            //         "struct-definition",
            //         "missing-initializer",
            //         "missing-initializer-call",
            //     ],
            // });
            // await aggchainFEPContract
            //     .connect(rollupManagerSigner)
            //     .initialize(initializeBytesCustomChainV1, {gasPrice: 0});

            // // check initializeBytesCustomChain
            // expect(await aggchainFEPContract.admin()).to.be.equal(data.admin);
            // expect(await aggchainFEPContract.vKeyManager()).to.be.equal(vKeyManager.address);
            // expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            // expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            // expect(await aggchainFEPContract.networkName()).to.be.equal(data.networkName);
            // expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);
            // expect(await aggchainFEPContract.aggregationVkey()).to.be.equal(data.aggregationVkey);
            // expect(await aggchainFEPContract.chainConfigHash()).to.be.equal(data.chainConfigHash);
            // expect(await aggchainFEPContract.rangeVkeyCommitment()).to.be.equal(data.rangeVkeyCommitment);
            // expect(chainData[0]).to.be.equal(data.initStateRoot);
            // expect(chainData[1]).to.be.equal(data.initTimestamp);
            // expect(chainData[2]).to.be.equal(data.initL2BlockNumber);

            // get customInitlizeData
            const customInitlizeData = await utilsFEP.encodeCustomInitializeData(
                data.aggregationVkey,
                data.chainConfigHash,
                data.rangeVkeyCommitment
            );

            // call updateCustomInitializeData & check
            await aggchainFEPContract.connect(admin).updateCustomInitializeData(customInitlizeData, {gasPrice: 0});
            expect(await aggchainFEPContract.aggregationVkey()).to.be.equal(data.aggregationVkey);
            expect(await aggchainFEPContract.chainConfigHash()).to.be.equal(data.chainConfigHash);
            expect(await aggchainFEPContract.rangeVkeyCommitment()).to.be.equal(data.rangeVkeyCommitment);

            // encode customChainData
            customChainData = utilsFEP.encodeCustomChainData(
                data.aggchainSelector,
                data.l1Head,
                data.l2PreRoot,
                data.claimRoot,
                data.claimBlockNum
            );

            // encode aggchainConfig
            aggchainConfig = utilsFEP.aggchainConfig(
                data.l1Head,
                data.l2PreRoot,
                data.claimRoot,
                data.claimBlockNum,
                data.chainConfigHash,
                data.rangeVkeyCommitment,
                data.aggregationVkey
            );

            // get aggchainVKeySelector
            aggchainVKeySelector = utilsFEP.getFinalAggchainSelector(data.aggchainSelector);

            // check aggchainVKeySelector
            expect(aggchainVKeySelector).to.be.equal(
                utilsFEP.AGGCHAIN_TYPE_SELECTOR_FEP + data.aggchainSelector.slice(2)
            );

            // get aggchainHash
            aggchainHash = utilsFEP.getAggchainHash(data.aggchainVkey, aggchainConfig);

            // add aggchainVKey to check aggchainHash
            await expect(aggchainFEPContract.connect(vKeyManager).disableUseDefaultGatewayFlag())
                .to.emit(aggchainFEPContract, "UpdateUseDefaultGatewayFlag")
                .withArgs(false);

            await expect(
                aggchainFEPContract.connect(vKeyManager).addOwnedAggchainVKey(aggchainVKeySelector, data.aggchainVkey)
            )
                .to.emit(aggchainFEPContract, "AddAggchainVKey")
                .withArgs(aggchainVKeySelector, data.aggchainVkey);

            // get aggchainHash from contract
            const aggchainHashContract = await aggchainFEPContract.getAggchainHash(customChainData, {gasPrice: 0});
            // check aggchainHash === aggchainHash from contract
            // with this check we can be sure that the aggchainConfig & aggchainHash works correctly
            expect(aggchainHash).to.be.equal(aggchainHashContract);

            // add data to test-vector
            data.vKeyManager = vKeyManager.address;
            data.admin = admin.address;
            data.initializeBytesCustomChainV0 = initializeBytesCustomChainV0;
            data.initializeBytesCustomChainV1 = initializeBytesCustomChainV1;
            data.customChainData = customChainData;
            data.customInitilizeData = customInitlizeData;
            data.aggchainVKeySelector = aggchainVKeySelector;
            data.aggchainHash = aggchainHash;

            console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
            await fs.writeFileSync(pathTestVector, JSON.stringify(dataFEP, null, 2));
        });
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
