/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    Address,
    AggchainFEP,
    PolygonPessimisticConsensus
} from "../../typechain-types";
import utilsFEP from "../../src/utils-aggchain-FEP";
import utilsAggchain from "../../src/utils-common-aggchain";

describe("AggchainFEP", () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;
    let vKeyManager: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;
    let optModeManager: any;

    let aggchainFEPV3contract: AggchainFEP;

    // Default values initialization
    const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
    const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
    const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
    const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;
    const agglayerGatewayAddress = "0xE00000000000000000000000000000000000000E" as unknown as Address;

    const urlSequencer = "http://zkevm-json-rpc:8123";
    const networkName = "zkevm";

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggchain variables
    const useDefaultGateway = false;
    const aggchainVKeyVersion = "0x1234";
    const newAggChainVKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin, vKeyManager, aggchainManager, optModeManager] = await ethers.getSigners();

        // deploy aggchain
        // create aggchainFEPV3 implementation
        const aggchainFEPV3Factory = await ethers.getContractFactory("AggchainFEP");
        aggchainFEPV3contract = await upgrades.deployProxy(aggchainFEPV3Factory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable", "missing-initializer-call"],
        });

        await aggchainFEPV3contract.waitForDeployment();

        // rollupSigner
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
    });

    it("should check the v0 initialized parameters", async () => {
        let initParamsCp;
        let initializeBytesCustomChain;

        // Define the struct values
        const initParams = {
            l2BlockTime: 10,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: 0,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        // modififiers: initialize using address != rollup manager
        await expect(aggchainFEPV3contract.initialize(initializeBytesCustomChain)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyRollupManager"
        );

        // use rollup manager from now on
        // initializeAggchain: submission interval = 0
        initParamsCp = Object.assign({}, initParams);
        initParamsCp.submissionInterval = 0;
        initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        await expect(aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "SubmissionIntervalMustBeGreaterThanZero"
        );

        // initializeAggchain: l2BlockTime = 0
        initParamsCp = Object.assign({}, initParams);
        initParamsCp.l2BlockTime = 0;
        initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        await expect(aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "L2BlockTimeMustBeGreaterThanZero"
        );

        // initializeAggchain: startingTimestamp > block.timestamp
        initParamsCp = Object.assign({}, initParams);
        initParamsCp.startingTimestamp = Math.floor(Date.now() / 1000) + 1000;
        initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        await expect(aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "StartL2TimestampMustBeGreaterThanCurrentTime"
        );

        // correct initialization
        initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPV3contract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPV3contract.submissionInterval()).to.be.equal(initParams.submissionInterval);
        expect(await aggchainFEPV3contract.rollupConfigHash()).to.be.equal(initParams.rollupConfigHash);
        expect(await aggchainFEPV3contract.aggChainManager()).to.be.equal(initParams.aggChainManager);
        expect(await aggchainFEPV3contract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPV3contract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPV3contract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPV3contract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPV3contract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPV3contract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        const aggchainType = await aggchainFEPV3contract.AGGCHAIN_TYPE();
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVKeyVersion, aggchainType);
        expect(await aggchainFEPV3contract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggChainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPV3contract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPV3contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPV3contract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPV3contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPV3contract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check the v1 initialized parameters", async () => {
        const networkID = 1;

        // Deploy previous ECDSA pessimistic contract
        let PolygonPPConsensusContract: PolygonPessimisticConsensus;

        const ppConsensusFactory = await ethers.getContractFactory("PolygonPessimisticConsensus");
        PolygonPPConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ["constructor", "state-variable-immutable", "missing-initializer-call"],
        });

        await PolygonPPConsensusContract.waitForDeployment();

        // initialize pessimistic consensus (ECDSA v0.2.0)
        await PolygonPPConsensusContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        // Upgrade proxy to FEPV3 implementation
        const aggchainFEPV3Factory = await ethers.getContractFactory("AggchainFEP");
        await upgrades.upgradeProxy(PolygonPPConsensusContract.target, aggchainFEPV3Factory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable", "missing-initializer-call"],
        });

        // New interface according to the new implemention
        aggchainFEPV3contract = aggchainFEPV3Factory.attach(PolygonPPConsensusContract.target) as unknown as AggchainFEP;

        // Define the struct values
        const initParams = {
            l2BlockTime: 10,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: 0,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        const initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv1(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address
        );

        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPV3contract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPV3contract.submissionInterval()).to.be.equal(initParams.submissionInterval);
        expect(await aggchainFEPV3contract.rollupConfigHash()).to.be.equal(initParams.rollupConfigHash);
        expect(await aggchainFEPV3contract.aggChainManager()).to.be.equal(initParams.aggChainManager);
        expect(await aggchainFEPV3contract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPV3contract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPV3contract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPV3contract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPV3contract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPV3contract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        const aggchainType = await aggchainFEPV3contract.AGGCHAIN_TYPE();
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVKeyVersion, aggchainType);
        expect(await aggchainFEPV3contract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggChainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPV3contract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPV3contract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPV3contract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPV3contract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPV3contract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check getAggchainHash", async () => {
        const blockData = await ethers.provider.getBlock("latest");
        const blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        const initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        // initialize using rollup manager
        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // calculate aggchainHash
        let newStateRoot = ethers.id("newStateRoot");
        let newl2BlockNumber = 104;
        let bytesAggChainData;

        // getAggchainHash: L2BlockNumberLessThanNextBlockNumber error
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPV3contract.getAggchainHash(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "L2BlockNumberLessThanNextBlockNumber"
        );

        // getAggchainHash: CannotProposeFutureL2Output error
        newl2BlockNumber = 1200;
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPV3contract.getAggchainHash(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "CannotProposeFutureL2Output"
        );

        // getAggchainHash: L2OutputRootCannotBeZero error
        newStateRoot = ethers.ZeroHash;
        newl2BlockNumber = 105;
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPV3contract.getAggchainHash(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "L2OutputRootCannotBeZero"
        );

        // getAggchainHash: correct aggchainHash
        newStateRoot = ethers.id("newStateRoot");
        newl2BlockNumber = 105;
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);
        const aggchainHashSC = await aggchainFEPV3contract.getAggchainHash(bytesAggChainData);

        // calculate aggchainHash JS
        const aggchainType = await aggchainFEPV3contract.AGGCHAIN_TYPE();
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVKeyVersion, aggchainType);
        const finakVKey = await aggchainFEPV3contract.ownedAggchainVKeys(aggchainVKeySelector);

        const oldL2Output = await aggchainFEPV3contract.getL2Output(0);
        const rollupConfigHash = await aggchainFEPV3contract.rollupConfigHash();
        const optimisticMode = await aggchainFEPV3contract.optimisticMode();
        const trustedSequencerSC = await aggchainFEPV3contract.trustedSequencer();

        const aggchainParamsBytes = utilsFEP.computeHashAggChainParamsFEP(
            oldL2Output.outputRoot,
            newStateRoot,
            newl2BlockNumber,
            rollupConfigHash,
            optimisticMode,
            trustedSequencerSC
        );

        const consensusTypeSC = await aggchainFEPV3contract.CONSENSUS_TYPE();

        const aggChainHashJS = utilsAggchain.computeAggchainHash(
            consensusTypeSC,
            finakVKey,
            aggchainParamsBytes
        );

        expect(aggchainHashSC).to.be.equal(aggChainHashJS);
    });

    it("should check generic getters", async () => {
        const blockData = await ethers.provider.getBlock("latest");
        const blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        const initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        // initialize using rollup manager
        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // SUBMISSION_INTERVAL
        expect(await aggchainFEPV3contract.SUBMISSION_INTERVAL()).to.be.equal(initParams.submissionInterval);

        // L2_BLOCK_TIME
        expect(await aggchainFEPV3contract.L2_BLOCK_TIME()).to.be.equal(initParams.l2BlockTime);

        // getL2Output
        const l2Output = await aggchainFEPV3contract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // latestOutputIndex
        expect(await aggchainFEPV3contract.latestOutputIndex()).to.be.equal(0);

        // nextOutputIndex
        expect(await aggchainFEPV3contract.nextOutputIndex()).to.be.equal(1);

        // latestBlockNumber
        expect(await aggchainFEPV3contract.latestBlockNumber()).to.be.equal(initParams.startingBlockNumber);

        // nextBlockNumber
        expect(await aggchainFEPV3contract.nextBlockNumber()).to.be.equal(initParams.startingBlockNumber + initParams.submissionInterval);

        // computeL2Timestamp
        const newBlockNumber = 105;
        const l2TimestampJS = initParams.startingTimestamp + ((newBlockNumber - initParams.startingBlockNumber) * initParams.l2BlockTime);
        const l2TimestampSC = await aggchainFEPV3contract.computeL2Timestamp(newBlockNumber);
        expect(l2TimestampJS).to.be.equal(l2TimestampSC);
    });

    it("should check onVerifyPessimistic", async () => {
        let blockData = await ethers.provider.getBlock("latest");
        let blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        const initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        // initialize using rollup manager
        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        let newStateRoot = ethers.id("newStateRoot");
        let newl2BlockNumber = 104;
        let bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        // get nextOutputIndex for the event
        const nextOutputIndex = await aggchainFEPV3contract.nextOutputIndex();

        // onVerifyPessimistic: not rollup Manager
        await expect(aggchainFEPV3contract.onVerifyPessimistic(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyRollupManager"
        );

        // onVerifyPessimistic: not rollup Manager
        const onVerifyPessimisticTx = await aggchainFEPV3contract.connect(rollupManagerSigner).onVerifyPessimistic(bytesAggChainData, {gasPrice: 0});

        // get timestamp
        blockData = await ethers.provider.getBlock("latest");
        blockDataTimestamp = blockData?.timestamp;

        await expect(onVerifyPessimisticTx)
            .to.emit(aggchainFEPV3contract, "OutputProposed")
            .withArgs(newStateRoot, nextOutputIndex, newl2BlockNumber, blockDataTimestamp)

        // verify correct new state
        const newL2Output = await aggchainFEPV3contract.getL2Output(1);
        expect(newL2Output.outputRoot).to.be.equal(newStateRoot);
        expect(newL2Output.l2BlockNumber).to.be.equal(newl2BlockNumber);
        expect(newL2Output.timestamp).to.be.equal(blockDataTimestamp);
    });

    it("should check aggChainManager role", async () => {
        let blockData = await ethers.provider.getBlock("latest");
        let blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        const initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        // initialize using rollup manager
        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // aggChainManager: functions
        // submission interval
        const oldSubmissionInterval = await aggchainFEPV3contract.SUBMISSION_INTERVAL();
        const newSubmissionInterval = 42;

        await expect(aggchainFEPV3contract.updateSubmissionInterval(newSubmissionInterval)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyAggChainManager"
        );

        await expect(aggchainFEPV3contract.connect(aggchainManager).updateSubmissionInterval(newSubmissionInterval))
            .to.emit(aggchainFEPV3contract, "SubmissionIntervalUpdated")
            .withArgs(oldSubmissionInterval, newSubmissionInterval);

        const newSubmissionIntervalSC = await aggchainFEPV3contract.SUBMISSION_INTERVAL();
        expect(newSubmissionIntervalSC).to.be.equal(newSubmissionInterval);

        // rollupConfigHash
        const oldRollupConfigHash = await aggchainFEPV3contract.rollupConfigHash();
        const newRollupConfigHash = ethers.id("newRollupConfigHash");

        await expect(aggchainFEPV3contract.updateRollupConfigHash(newRollupConfigHash)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyAggChainManager"
        );

        await expect(aggchainFEPV3contract.connect(aggchainManager).updateRollupConfigHash(newRollupConfigHash))
            .to.emit(aggchainFEPV3contract, "RollupConfigHashUpdated")
            .withArgs(oldRollupConfigHash, newRollupConfigHash);

        const newRollupConfigHashSC = await aggchainFEPV3contract.rollupConfigHash();
        expect(newRollupConfigHashSC).to.be.equal(newRollupConfigHash);


        // aggChainManager: managing role
        await expect(aggchainFEPV3contract.transferAggChainManagerRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyAggChainManager"
        );

        await expect(aggchainFEPV3contract.connect(aggchainManager).transferAggChainManagerRole(deployer.address))
            .to.emit(aggchainFEPV3contract, "TransferAggChainManagerRole")
            .withArgs(aggchainManager, deployer.address);

        const pendingAggChainManager = await aggchainFEPV3contract.pendingAggChainManager();
        expect(pendingAggChainManager).to.be.equal(deployer.address);

        await expect(aggchainFEPV3contract.connect(aggchainManager).acceptAggChainManagerRole()).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyPendingAggChainManager"
        );

        await expect(aggchainFEPV3contract.acceptAggChainManagerRole())
            .to.emit(aggchainFEPV3contract, "AcceptAggChainManagerRole")
            .withArgs(aggchainManager, deployer.address);

        const finalAggChainManager = await aggchainFEPV3contract.aggChainManager();
        expect(finalAggChainManager).to.be.equal(deployer.address);
    });

    it("should check optimisticModeManager role", async () => {
        let blockData = await ethers.provider.getBlock("latest");
        let blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id("rollupConfigHash"),
            startingOutputRoot: ethers.id("startingOutputRoot"),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            aggChainManager: aggchainManager.address,
            optimisticModeManager: optModeManager.address,
        };

        const initializeBytesCustomChain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggChainVKey,
            aggchainVKeyVersion,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName
        );

        // initialize using rollup manager
        await aggchainFEPV3contract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // optimisticModeManager: functions
        // enable optimistic mode
        await expect(aggchainFEPV3contract.enableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyOptimisticModeManager"
        );

        await expect(aggchainFEPV3contract.connect(optModeManager).disableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OptimisticModeNotEnabled"
        );

        await expect(aggchainFEPV3contract.connect(optModeManager).enableOptimisticMode())
            .to.emit(aggchainFEPV3contract, "EnableOptimisticMode");

        // disable optimistic mode
        await expect(aggchainFEPV3contract.disableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyOptimisticModeManager"
        );

        await expect(aggchainFEPV3contract.connect(optModeManager).enableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OptimisticModeEnabled"
        );

        await expect(aggchainFEPV3contract.connect(optModeManager).disableOptimisticMode())
            .to.emit(aggchainFEPV3contract, "DisableOptimisticMode");


        // optModeManager role functions
        await expect(aggchainFEPV3contract.transferOptimisticModeManagerRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyOptimisticModeManager"
        );

        await expect(aggchainFEPV3contract.connect(optModeManager).transferOptimisticModeManagerRole(deployer.address))
            .to.emit(aggchainFEPV3contract, "TransferOptimisticModeManagerRole")
            .withArgs(optModeManager, deployer.address);

        const pendingOptimisticModeManager = await aggchainFEPV3contract.pendingOptimisticModeManager();
        expect(pendingOptimisticModeManager).to.be.equal(deployer.address);

        await expect(aggchainFEPV3contract.connect(optModeManager).acceptOptimisticModeManagerRole()).to.be.revertedWithCustomError(
            aggchainFEPV3contract,
            "OnlyPendingOptimisticModeManager"
        );

        await expect(aggchainFEPV3contract.acceptOptimisticModeManagerRole())
            .to.emit(aggchainFEPV3contract, "AcceptOptimisticModeManagerRole")
            .withArgs(optModeManager, deployer.address);

        const finalOptimisticModeManager = await aggchainFEPV3contract.optimisticModeManager();
        expect(finalOptimisticModeManager).to.be.equal(deployer.address);
    });
});
