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

    let aggchainFEPcontract: AggchainFEP;

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
        // create aggchainFEP implementation
        const aggchainFEPFactory = await ethers.getContractFactory("AggchainFEP");
        aggchainFEPcontract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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

        await aggchainFEPcontract.waitForDeployment();

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
        await expect(aggchainFEPcontract.initialize(initializeBytesCustomChain)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
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

        await expect(aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})).to.be.revertedWithCustomError(
            aggchainFEPcontract,
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

        await expect(aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})).to.be.revertedWithCustomError(
            aggchainFEPcontract,
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

        await expect(aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})).to.be.revertedWithCustomError(
            aggchainFEPcontract,
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

        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPcontract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPcontract.submissionInterval()).to.be.equal(initParams.submissionInterval);
        expect(await aggchainFEPcontract.rollupConfigHash()).to.be.equal(initParams.rollupConfigHash);
        expect(await aggchainFEPcontract.aggChainManager()).to.be.equal(initParams.aggChainManager);
        expect(await aggchainFEPcontract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPcontract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPcontract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPcontract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPcontract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPcontract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        const aggchainType = await aggchainFEPcontract.AGGCHAIN_TYPE();
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVKeyVersion, aggchainType);
        expect(await aggchainFEPcontract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggChainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPcontract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPcontract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPcontract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPcontract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPcontract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})
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

        // Upgrade proxy to FEP implementation
        const aggchainFEPFactory = await ethers.getContractFactory("AggchainFEP");
        await upgrades.upgradeProxy(PolygonPPConsensusContract.target, aggchainFEPFactory, {
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
        aggchainFEPcontract = aggchainFEPFactory.attach(PolygonPPConsensusContract.target) as unknown as AggchainFEP;

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

        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPcontract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPcontract.submissionInterval()).to.be.equal(initParams.submissionInterval);
        expect(await aggchainFEPcontract.rollupConfigHash()).to.be.equal(initParams.rollupConfigHash);
        expect(await aggchainFEPcontract.aggChainManager()).to.be.equal(initParams.aggChainManager);
        expect(await aggchainFEPcontract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPcontract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPcontract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPcontract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPcontract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPcontract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        const aggchainType = await aggchainFEPcontract.AGGCHAIN_TYPE();
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVKeyVersion, aggchainType);
        expect(await aggchainFEPcontract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggChainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPcontract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPcontract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPcontract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPcontract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPcontract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0})
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
        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // calculate aggchainHash
        let newStateRoot = ethers.id("newStateRoot");
        let newl2BlockNumber = 104;
        let bytesAggChainData;

        // getAggchainHash: L2BlockNumberLessThanNextBlockNumber error
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPcontract.getAggchainHash(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "L2BlockNumberLessThanNextBlockNumber"
        );

        // getAggchainHash: CannotProposeFutureL2Output error
        newl2BlockNumber = 1200;
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPcontract.getAggchainHash(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "CannotProposeFutureL2Output"
        );

        // getAggchainHash: L2OutputRootCannotBeZero error
        newStateRoot = ethers.ZeroHash;
        newl2BlockNumber = 105;
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPcontract.getAggchainHash(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "L2OutputRootCannotBeZero"
        );

        // getAggchainHash: correct aggchainHash
        newStateRoot = ethers.id("newStateRoot");
        newl2BlockNumber = 105;
        bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);
        const aggchainHashSC = await aggchainFEPcontract.getAggchainHash(bytesAggChainData);

        // calculate aggchainHash JS
        const aggchainType = await aggchainFEPcontract.AGGCHAIN_TYPE();
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVKeyVersion, aggchainType);
        const finakVKey = await aggchainFEPcontract.ownedAggchainVKeys(aggchainVKeySelector);

        const oldL2Output = await aggchainFEPcontract.getL2Output(0);
        const rollupConfigHash = await aggchainFEPcontract.rollupConfigHash();
        const optimisticMode = await aggchainFEPcontract.optimisticMode();
        const trustedSequencerSC = await aggchainFEPcontract.trustedSequencer();

        const aggchainParamsBytes = utilsFEP.computeHashAggChainParamsFEP(
            oldL2Output.outputRoot,
            newStateRoot,
            newl2BlockNumber,
            rollupConfigHash,
            optimisticMode,
            trustedSequencerSC
        );

        const consensusTypeSC = await aggchainFEPcontract.CONSENSUS_TYPE();

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
        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // SUBMISSION_INTERVAL
        expect(await aggchainFEPcontract.SUBMISSION_INTERVAL()).to.be.equal(initParams.submissionInterval);

        // L2_BLOCK_TIME
        expect(await aggchainFEPcontract.L2_BLOCK_TIME()).to.be.equal(initParams.l2BlockTime);

        // getL2Output
        const l2Output = await aggchainFEPcontract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // latestOutputIndex
        expect(await aggchainFEPcontract.latestOutputIndex()).to.be.equal(0);

        // nextOutputIndex
        expect(await aggchainFEPcontract.nextOutputIndex()).to.be.equal(1);

        // latestBlockNumber
        expect(await aggchainFEPcontract.latestBlockNumber()).to.be.equal(initParams.startingBlockNumber);

        // nextBlockNumber
        expect(await aggchainFEPcontract.nextBlockNumber()).to.be.equal(initParams.startingBlockNumber + initParams.submissionInterval);

        // computeL2Timestamp
        const newBlockNumber = 105;
        const l2TimestampJS = initParams.startingTimestamp + ((newBlockNumber - initParams.startingBlockNumber) * initParams.l2BlockTime);
        const l2TimestampSC = await aggchainFEPcontract.computeL2Timestamp(newBlockNumber);
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
        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        let newStateRoot = ethers.id("newStateRoot");
        let newl2BlockNumber = 104;
        let bytesAggChainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, newStateRoot, newl2BlockNumber);

        // get nextOutputIndex for the event
        const nextOutputIndex = await aggchainFEPcontract.nextOutputIndex();

        // onVerifyPessimistic: not rollup Manager
        await expect(aggchainFEPcontract.onVerifyPessimistic(bytesAggChainData)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyRollupManager"
        );

        // onVerifyPessimistic: not rollup Manager
        const onVerifyPessimisticTx = await aggchainFEPcontract.connect(rollupManagerSigner).onVerifyPessimistic(bytesAggChainData, {gasPrice: 0});

        // get timestamp
        blockData = await ethers.provider.getBlock("latest");
        blockDataTimestamp = blockData?.timestamp;

        await expect(onVerifyPessimisticTx)
            .to.emit(aggchainFEPcontract, "OutputProposed")
            .withArgs(newStateRoot, nextOutputIndex, newl2BlockNumber, blockDataTimestamp)

        // verify correct new state
        const newL2Output = await aggchainFEPcontract.getL2Output(1);
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
        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // aggChainManager: functions
        // submission interval
        const oldSubmissionInterval = await aggchainFEPcontract.SUBMISSION_INTERVAL();
        const newSubmissionInterval = 42;

        await expect(aggchainFEPcontract.updateSubmissionInterval(newSubmissionInterval)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyAggChainManager"
        );

        await expect(aggchainFEPcontract.connect(aggchainManager).updateSubmissionInterval(newSubmissionInterval))
            .to.emit(aggchainFEPcontract, "SubmissionIntervalUpdated")
            .withArgs(oldSubmissionInterval, newSubmissionInterval);

        const newSubmissionIntervalSC = await aggchainFEPcontract.SUBMISSION_INTERVAL();
        expect(newSubmissionIntervalSC).to.be.equal(newSubmissionInterval);

        // rollupConfigHash
        const oldRollupConfigHash = await aggchainFEPcontract.rollupConfigHash();
        const newRollupConfigHash = ethers.id("newRollupConfigHash");

        await expect(aggchainFEPcontract.updateRollupConfigHash(newRollupConfigHash)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyAggChainManager"
        );

        await expect(aggchainFEPcontract.connect(aggchainManager).updateRollupConfigHash(newRollupConfigHash))
            .to.emit(aggchainFEPcontract, "RollupConfigHashUpdated")
            .withArgs(oldRollupConfigHash, newRollupConfigHash);

        const newRollupConfigHashSC = await aggchainFEPcontract.rollupConfigHash();
        expect(newRollupConfigHashSC).to.be.equal(newRollupConfigHash);


        // aggChainManager: managing role
        await expect(aggchainFEPcontract.transferAggChainManagerRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyAggChainManager"
        );

        await expect(aggchainFEPcontract.connect(aggchainManager).transferAggChainManagerRole(deployer.address))
            .to.emit(aggchainFEPcontract, "TransferAggChainManagerRole")
            .withArgs(aggchainManager, deployer.address);

        const pendingAggChainManager = await aggchainFEPcontract.pendingAggChainManager();
        expect(pendingAggChainManager).to.be.equal(deployer.address);

        await expect(aggchainFEPcontract.connect(aggchainManager).acceptAggChainManagerRole()).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyPendingAggChainManager"
        );

        await expect(aggchainFEPcontract.acceptAggChainManagerRole())
            .to.emit(aggchainFEPcontract, "AcceptAggChainManagerRole")
            .withArgs(aggchainManager, deployer.address);

        const finalAggChainManager = await aggchainFEPcontract.aggChainManager();
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
        await aggchainFEPcontract.connect(rollupManagerSigner).initialize(initializeBytesCustomChain, {gasPrice: 0});

        // optimisticModeManager: functions
        // enable optimistic mode
        await expect(aggchainFEPcontract.enableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyOptimisticModeManager"
        );

        await expect(aggchainFEPcontract.connect(optModeManager).disableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OptimisticModeNotEnabled"
        );

        await expect(aggchainFEPcontract.connect(optModeManager).enableOptimisticMode())
            .to.emit(aggchainFEPcontract, "EnableOptimisticMode");

        // disable optimistic mode
        await expect(aggchainFEPcontract.disableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyOptimisticModeManager"
        );

        await expect(aggchainFEPcontract.connect(optModeManager).enableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OptimisticModeEnabled"
        );

        await expect(aggchainFEPcontract.connect(optModeManager).disableOptimisticMode())
            .to.emit(aggchainFEPcontract, "DisableOptimisticMode");


        // optModeManager role functions
        await expect(aggchainFEPcontract.transferOptimisticModeManagerRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyOptimisticModeManager"
        );

        await expect(aggchainFEPcontract.connect(optModeManager).transferOptimisticModeManagerRole(deployer.address))
            .to.emit(aggchainFEPcontract, "TransferOptimisticModeManagerRole")
            .withArgs(optModeManager, deployer.address);

        const pendingOptimisticModeManager = await aggchainFEPcontract.pendingOptimisticModeManager();
        expect(pendingOptimisticModeManager).to.be.equal(deployer.address);

        await expect(aggchainFEPcontract.connect(optModeManager).acceptOptimisticModeManagerRole()).to.be.revertedWithCustomError(
            aggchainFEPcontract,
            "OnlyPendingOptimisticModeManager"
        );

        await expect(aggchainFEPcontract.acceptOptimisticModeManagerRole())
            .to.emit(aggchainFEPcontract, "AcceptOptimisticModeManagerRole")
            .withArgs(optModeManager, deployer.address);

        const finalOptimisticModeManager = await aggchainFEPcontract.optimisticModeManager();
        expect(finalOptimisticModeManager).to.be.equal(deployer.address);
    });
});
