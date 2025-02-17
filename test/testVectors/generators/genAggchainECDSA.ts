import {ethers, upgrades} from "hardhat";
import {Address, AggchainECDSA} from "../../../typechain-types";
import {expect} from "chai";
import fs = require("fs");
import path = require("path");

const dataECDSA = require("../data/aggchainECDSA.json");
const utilsECDSA = require("../../../src/utils-aggchain-ECDSA");
const pathTestVector = path.join(__dirname, "../finalData/aggchainECDSA.json");

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
    let initializeBytesCustomChainV0: string;
    let initializeBytesCustomChainV1: string;
    let aggchainConfig: string;
    let aggchainSelectors: string[] = [];
    let customChainData: string[] = [];
    let aggchainHash: string[] = [];

    for (let i = 0; i < dataECDSA.length; i++) {
        const data = dataECDSA[i];

        it(`generate id: ${i}`, async function () {
            // load signers
            [vKeyManager, admin] = await ethers.getSigners();

            if (data.aggchainVKeySelectors.length !== data.ownedAggchainVkeys.length) {
                throw new Error("aggchainVKeySelectors and ownedAggchainVkeys must have the same length");
            }

            if (data.aggchainVKeySelectors.length !== 0) {
                for (let j = 0; j < data.aggchainVKeySelectors.length; j++) {
                    // get final aggchainSelector
                    aggchainSelectors.push(utilsECDSA.getFinalAggchainSelectorECDSA(data?.aggchainVKeySelectors[j]));

                    // check final aggchainSelector
                    expect(aggchainSelectors[j]).to.be.equal(
                        utilsECDSA.AGGCHAIN_TYPE_SELECTOR_ECDSA + data.aggchainVKeySelectors[j].slice(2)
                    );
                }
            }

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
            initializeBytesCustomChainV0 = utilsECDSA.encodeInitializeBytesCustomChainECDSAv0(
                data.useDefaultGateway,
                data.ownedAggchainVkeys,
                aggchainSelectors,
                vKeyManager.address,
                admin.address,
                data.trustedSequencer,
                data.gasTokenAddress,
                data.trustedSequencerURL,
                data.networkName
            );

            // initialize using rollup manager & initializeBytesCustomChain
            await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
            const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
            await aggchainECDSAContract
                .connect(rollupManagerSigner)
                .initialize(initializeBytesCustomChainV0, {gasPrice: 0});

            // check initializeBytesCustomChain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);

            for (let j = 0; j < aggchainSelectors.length; j++) {
                console.log("Added aggchainSelector: ", aggchainSelectors[j]);
                console.log("Added ownedAggchainVKey: ", data.ownedAggchainVkeys[j]);
                expect(await aggchainECDSAContract.ownedAggchainVKeys(aggchainSelectors[j])).to.be.equal(
                    data.ownedAggchainVkeys[j]
                );
            }

            // encode aggchainConfig
            aggchainConfig = utilsECDSA.aggchainConfigECDSA(data.trustedSequencer);

            // if useDefaultGateway is true, disable it
            if (data.useDefaultGateway) {
                await expect(aggchainECDSAContract.connect(vKeyManager).disableUseDefaultGatewayFlag())
                    .to.emit(aggchainECDSAContract, "UpdateUseDefaultGatewayFlag")
                    .withArgs(false);
            }

            for (let j = 0; j < aggchainSelectors.length; j++) {
                // encode customChainData
                customChainData.push(
                    utilsECDSA.encodeCustomChainDataECDSA(data.aggchainVKeySelectors[j], data.newStateRoot)
                );
                // get aggchainHash
                aggchainHash.push(utilsECDSA.getAggchainHashECDSA(data.ownedAggchainVkeys[j], aggchainConfig));
                // get aggchainHash from contract
                const aggchainHashContract = await aggchainECDSAContract.getAggchainHash(customChainData[j], {
                    gasPrice: 0,
                });
                // check aggchainHash === aggchainHash from contract
                // with this check we can be sure that the aggchainConfig & aggchainHash works correctly
                expect(aggchainHash[j]).to.be.equal(aggchainHashContract);
            }

            // reinitialize using rollup manager & initializeBytesCustomChainECDSAv1

            // deploy polygonPessimisticConsensus
            // create polygonPessimisticConsensus implementation
            const ppConsensusFactory = await ethers.getContractFactory("PolygonPessimisticConsensus");
            let ppConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
                initializer: false,
                constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
                unsafeAllow: ["constructor", "state-variable-immutable"],
            });
            await ppConsensusContract.waitForDeployment();

            await ppConsensusContract
                .connect(rollupManagerSigner)
                .initialize(
                    admin.address,
                    data.trustedSequencer,
                    0,
                    data.gasTokenAddress,
                    data.trustedSequencerURL,
                    data.networkName,
                    {
                        gasPrice: 0,
                    }
                );

            // upgrade to aggchainECDSA (reinitialize)
            ppConsensusContract = await upgrades.upgradeProxy(ppConsensusContract.target, aggchainECDSAFactory, {
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
                    "enum-definition",
                    "struct-definition",
                    "missing-initializer",
                    "missing-initializer-call",
                ],
            });

            // encode initializeBytesCustomChain version 1
            initializeBytesCustomChainV1 = utilsECDSA.encodeInitializeBytesCustomChainECDSAv1(
                data.useDefaultGateway,
                data.ownedAggchainVkeys,
                aggchainSelectors,
                vKeyManager.address
            );

            await ppConsensusContract
                .connect(rollupManagerSigner)
                .initialize(initializeBytesCustomChainV1, {gasPrice: 0});

            // check initializeBytesCustomChain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);

            for (let j = 0; j < aggchainSelectors.length; j++) {
                expect(await aggchainECDSAContract.ownedAggchainVKeys(aggchainSelectors[j])).to.be.equal(
                    data.ownedAggchainVkeys[j]
                );
            }

            // add data to test-vector
            data.vKeyManager = vKeyManager.address;
            data.admin = admin.address;
            data.initializeBytesCustomChainV0 = initializeBytesCustomChainV0;
            data.initializeBytesCustomChainV1 = initializeBytesCustomChainV1;
            data.customChainData = customChainData;
            data.aggchainSelectors = aggchainSelectors;
            data.aggchainHashes = aggchainHash;
            data.aggchainConfig = aggchainConfig;

            console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
            await fs.writeFileSync(pathTestVector, JSON.stringify(dataECDSA, null, 2));
        });
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
