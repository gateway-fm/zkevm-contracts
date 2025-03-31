import {expect} from "chai";
import {ethers} from "hardhat";

import {MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {getContractAddress} = require("@ethersproject/address");

import {padTo32Bytes, padTo20Bytes} from "./deployment-utils";

// constants
// Those contracts names came from the genesis creation:
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L294
//  - https://github.com/0xPolygonHermez/zkevm-contracts/blob/main/deployment/v2/1_createGenesis.ts#L328
// Genesis files have been created previously and so they have old naming, as it shown in the links above
// Those genesis are already imported on different tooling and added as a metedata on-chain. Therefore, this util aims
// to support them too
const bridgeContractName = "BridgeL2SovereignChain";
const supportedGERManagers = ["PolygonZkEVMGlobalExitRootL2 implementation"];
const supportedBridgeContracts = ['PolygonZkEVMBridge implementation', 'PolygonZkEVMBridgeV2 implementation'];
const supportedBridgeContractsProxy = ['PolygonZkEVMBridgeV2 proxy', 'PolygonZkEVMBridge proxy'];
const TokenWrappedBridgeInitCodeContractName = "TokenWrappedBridgeInitCode";

async function updateVanillaGenesis(genesis, chainID, initializeParams) {
    // Load genesis on a zkEVMDB
    const poseidon = await getPoseidon();
    const {F} = poseidon;
    const db = new MemDB(F);
    const genesisRoot = [F.zero, F.zero, F.zero, F.zero];
    const accHashInput = [F.zero, F.zero, F.zero, F.zero];
    const zkEVMDB = await ZkEVMDB.newZkEVM(
        db,
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID
    );
    const batch = await zkEVMDB.buildBatch(
        1000, //limitTimestamp
        ethers.ZeroAddress, //trustedSequencer
        smtUtils.stringToH4(ethers.ZeroHash) // l1InfoRoot
    );
    // Add changeL2Block tx
    const txChangeL2Block = {
        type: 11,
        deltaTimestamp: 3,
        l1Info: {
            globalExitRoot: ethers.ZeroAddress, // Can be any value
            blockHash: "0x24a5871d68723340d9eadc674aa8ad75f3e33b61d5a9db7db92af856a19270bb", // Can be any value
            timestamp: "42",
        },
        indexL1InfoTree: 0,
    };
    const rawChangeL2BlockTx = processorUtils.serializeChangeL2Block(txChangeL2Block);
    batch.addRawTx(`0x${rawChangeL2BlockTx}`);

    // Create deploy bridge transaction
    const sovereignBridgeFactory = await ethers.getContractFactory("BridgeL2SovereignChain");
    // Get deploy transaction for bridge
    const deployBridgeData = await sovereignBridgeFactory.getDeployTransaction();
    const injectedTx = {
        type: 0, // force ethers to parse it as a legacy transaction
        chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
        to: null,
        value: 0,
        gasPrice: 0,
        gasLimit: 30000000,
        nonce: 0,
        data: deployBridgeData.data,
        signature: {
            v: "0x1b",
            r: "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0",
            s: "0x000000000000000000000000000000000000000000000000000000005ca1ab1e",
        },
    };
    let txObject = ethers.Transaction.from(injectedTx);
    const txDeployBridge = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch.addRawTx(txDeployBridge);
    const sovereignBridgeAddress = getContractAddress({from: txObject.from, nonce: injectedTx.nonce});

    // Create deploy GER transaction
    const gerContractName = "GlobalExitRootManagerL2SovereignChain";
    const gerFactory = await ethers.getContractFactory(gerContractName);
    const oldBridge = genesis.genesis.find(function (obj) {
        return supportedBridgeContracts.includes(obj.contractName);
    });
    // Get bridge proxy address
    const bridgeProxy = genesis.genesis.find(function (obj) {
        return supportedBridgeContractsProxy.includes(obj.contractName);
    });
    const deployGERData = await gerFactory.getDeployTransaction(bridgeProxy.address);
    injectedTx.data = deployGERData.data;
    txObject = ethers.Transaction.from(injectedTx);
    const txDeployGER = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch.addRawTx(txDeployGER);
    const GERAddress = getContractAddress({from: txObject.from, nonce: injectedTx.nonce});

    await batch.executeTxs();
    await zkEVMDB.consolidate(batch);

    // replace old bridge and ger manager by sovereign contracts bytecode
    oldBridge.contractName = bridgeContractName + " implementation";
    oldBridge.bytecode = `0x${await zkEVMDB.getBytecode(sovereignBridgeAddress)}`;

    // Compute the address of the TokenWrappedBridgeInitCode contract deployed by the deployed sovereign bridge
    const precalculatedAddressDeployedSovereignBridge = ethers.getCreateAddress(
        {
            from: sovereignBridgeAddress,
            nonce: 1
        }
    );

    // Check if the genesis contains TokenWrappedBridgeInitCode contract
    const tokenWrappedBridgeInitCodeObject = genesis.genesis.find(function (obj) {
        return obj.contractName == TokenWrappedBridgeInitCodeContractName;
    });

    // If its not contained add it to the genesis
    if (typeof tokenWrappedBridgeInitCodeObject === "undefined") {
        const tokenWrappedBridgeInitCodeDeployedBytecode = `0x${await zkEVMDB.getBytecode(precalculatedAddressDeployedSovereignBridge)}`;
        const tokenWrappedBridgeInitCodeGenesis = {
            contractName: TokenWrappedBridgeInitCodeContractName,
            balance: "0",
            nonce: "1",
            address: precalculatedAddressDeployedSovereignBridge,
            bytecode: tokenWrappedBridgeInitCodeDeployedBytecode,
        };
        genesis.genesis.push(tokenWrappedBridgeInitCodeGenesis);
    } else {
        tokenWrappedBridgeInitCodeObject.address = precalculatedAddressDeployedSovereignBridge;
        // Check address and bytecode of the TokenWrappedBridgeInitCode contract
        expect(tokenWrappedBridgeInitCodeObject.bytecode).to.equal(
            `0x${await zkEVMDB.getBytecode(precalculatedAddressDeployedSovereignBridge)}`)
    }

    const oldGer = genesis.genesis.find(function (obj) {
        return supportedGERManagers.includes(obj.contractName);
    });
    oldGer.contractName = gerContractName + " implementation";
    oldGer.bytecode = `0x${await zkEVMDB.getBytecode(GERAddress)}`;

    // Setup a second zkEVM to initialize both contracts
    const zkEVMDB2 = await ZkEVMDB.newZkEVM(
        new MemDB(F),
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID
    );
    const batch2 = await zkEVMDB2.buildBatch(
        1000, //limitTimestamp
        ethers.ZeroAddress, //trustedSequencer
        smtUtils.stringToH4(ethers.ZeroHash) // l1InfoRoot
    );
    // Add changeL2Block tx
    batch2.addRawTx(`0x${rawChangeL2BlockTx}`);
    const gerProxy = genesis.genesis.find(function (obj) {
        return obj.contractName == "PolygonZkEVMGlobalExitRootL2 proxy";
    });
    // Initialize bridge
    const {
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        polygonRollupManager,
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        globalExitRootUpdater,
        globalExitRootRemover,
    } = initializeParams;
    const initializeData = sovereignBridgeFactory.interface.encodeFunctionData(
        "initialize(uint32,address,uint32,address,address,bytes,address,address,bool)",
        [
            rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            gerProxy.address, // Global exit root manager address from base genesis
            polygonRollupManager,
            gasTokenMetadata,
            bridgeManager,
            sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable,
        ]
    );
    injectedTx.to = bridgeProxy.address;
    injectedTx.data = initializeData;
    txObject = ethers.Transaction.from(injectedTx);
    const txInitializeBridge = processorUtils.rawTxToCustomRawTx(txObject.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch2.addRawTx(txInitializeBridge);

    // Initialize GER Manager
    const initializeGERData = gerFactory.interface.encodeFunctionData("initialize", [
        globalExitRootUpdater,
        globalExitRootRemover,
    ]);
    // Update injectedTx to initialize GER
    injectedTx.to = gerProxy.address;
    injectedTx.data = initializeGERData;

    const txObject2 = ethers.Transaction.from(injectedTx);
    const txInitializeGER = processorUtils.rawTxToCustomRawTx(txObject2.serialized);
    // Check ecrecover
    expect(txObject.from).to.equal(ethers.recoverAddress(txObject.unsignedHash, txObject.signature as any));
    batch2.addRawTx(txInitializeGER);

    // Execute batch
    await batch2.executeTxs();
    await zkEVMDB2.consolidate(batch2);

    // Update bridgeProxy storage and nonce
    bridgeProxy.contractName = bridgeContractName + " proxy";
    bridgeProxy.storage = await zkEVMDB2.dumpStorage(bridgeProxy.address);
    // Update nonce, in case weth is deployed at initialize, it is increased
    const bridgeProxyState = await zkEVMDB2.getCurrentAccountState(bridgeProxy.address)
    bridgeProxy.nonce = String(Number(bridgeProxyState.nonce));
    // If bridge initialized with a zero sovereign weth address and a non zero gas token, we should add created erc20 weth contract to the genesis
    let wethAddress;
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        wethAddress = padTo20Bytes(
            bridgeProxy.storage["0x000000000000000000000000000000000000000000000000000000000000006f"]
        );
        const wethGenesis = {
            contractName: "WETH",
            balance: "0",
            nonce: "1",
            address: wethAddress,
            bytecode: `0x${await zkEVMDB2.getBytecode(wethAddress)}`,
        };
        const wethStorage = await zkEVMDB2.dumpStorage(wethAddress);
        wethGenesis.storage = Object.entries(wethStorage).reduce((acc, [key, value]) => {
            acc[key] = padTo32Bytes(value);
            return acc;
        }, {});
        genesis.genesis.push(wethGenesis);
    }

    // Pad storage values with zeros
    bridgeProxy.storage = Object.entries(bridgeProxy.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // CHECK BRIDGE PROXY STORAGE
    // Storage value pointing bridge implementation
    expect(bridgeProxy.storage["0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"]).to.include(
        oldBridge.address.toLowerCase().slice(2)
    );

    // Storage value of proxyAdmin
    const proxyAdminObject = genesis.genesis.find(function (obj) {
        return obj.contractName == "ProxyAdmin";
    });
    expect(bridgeProxy.storage["0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"]).to.include(
        proxyAdminObject.address.toLowerCase().slice(2)
    );

    // Storage value of bridge manager
    expect(bridgeProxy.storage["0x00000000000000000000000000000000000000000000000000000000000000a3"]).to.include(
        bridgeManager.toLowerCase().slice(2)
    );

    // Storage value for the _initialized uint8 variable of Initializable.sol contract, incremented each time the contract is successfully initialized. It also stores the _initializing param set to true when an initialization function is being executed, and it reverts to false once the initialization completed.
    expect(bridgeProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000000"]).to.equal(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
    );

    // Storage value for the _status variable of ReentrancyGuardUpgradeable contract. Tracks the current "status" of the contract to enforce the non-reentrant behavior. Default value is 1 (_NOT_ENTERED)
    expect(bridgeProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000001"]).to.equal(
        "0x0000000000000000000000000000000000000000000000000000000000000001"
    );

    // Storage value for global exit root manager (proxy) address
    expect(bridgeProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000068"]).to.include(
        gerProxy.address.toLowerCase().slice(2)
    );

    // Storage value for rollup/network id
    // RollupID value is stored at position 68 with globalExitRootManager address. Slice from byte 2 to 2-8 to get the rollupID
    expect(
        bridgeProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000068"].slice(
            2 + 54,
            2 + 54 + 8
        )
    ).to.include(rollupID.toString(16));

    // Storage value for gas token address
    if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
        expect(
            ethers.toBigInt(bridgeProxy.storage["0x000000000000000000000000000000000000000000000000000000000000006d"])
        ).to.equal(
            ethers.toBigInt(`${ethers.toBeHex(gasTokenNetwork)}${gasTokenAddress.replace(/^0x/, "")}`.toLowerCase())
        );
        if (ethers.isAddress(sovereignWETHAddress) && sovereignWETHAddress !== ethers.ZeroAddress) {
            // Storage value for sovereignWETH address (ony if network with native gas token) and sovereignWethAddress is set
            expect(
                bridgeProxy.storage["0x000000000000000000000000000000000000000000000000000000000000006f"]
            ).to.include(sovereignWETHAddress.toLowerCase().slice(2));

            // Storage address for sovereignWETHAddressIsNotMintable mapping
            // To get the key we encode the key of the mapping with the position in the mapping
            if (sovereignWETHAddressIsNotMintable) {
                const mappingSlot = 162; // Slot of the mapping in the bridge contract
                const key = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256"],
                        [sovereignWETHAddress, mappingSlot]
                    )
                );
                expect(bridgeProxy.storage[key]).to.equal(
                    "0x0000000000000000000000000000000000000000000000000000000000000001"
                );
            }
        } else {
            // Storage value for WETH address (ony if network with native gas token), deployed at bridge initialization
            expect(
                bridgeProxy.storage["0x000000000000000000000000000000000000000000000000000000000000006f"]
            ).to.include(wethAddress.toLowerCase().slice(2));

            // CHECK WETH STORAGE
            const wethOject = genesis.genesis.find(function (obj) {
                return obj.contractName == "WETH";
            });

            // Storage for erc20 name 'Wrapped Ether'
            expect(wethOject.storage["0x0000000000000000000000000000000000000000000000000000000000000003"]).to.equal(
                "0x577261707065642045746865720000000000000000000000000000000000001a"
            );

            // Storage for erc20 code 'WETH'
            expect(wethOject.storage["0x0000000000000000000000000000000000000000000000000000000000000004"]).to.equal(
                "0x5745544800000000000000000000000000000000000000000000000000000008"
            );
        }

        // Storage values for gasTokenMetadata, its a bytes variable
        let offset = 2 + 64;
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142a"]).to.include(
            gasTokenMetadata.slice(2, offset)
        );
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142b"]).to.include(
            gasTokenMetadata.slice(offset, offset + 64)
        );
        offset += 64;
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142c"]).to.include(
            gasTokenMetadata.slice(offset, offset + 64)
        );
        offset += 64;
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142d"]).to.include(
            gasTokenMetadata.slice(offset, offset + 64)
        );
        offset += 64;
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142e"]).to.include(
            gasTokenMetadata.slice(offset, offset + 64)
        );
        offset += 64;
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db7142f"]).to.include(
            gasTokenMetadata.slice(offset, offset + 64)
        );
        offset += 64;
        expect(bridgeProxy.storage["0x9930d9ff0dee0ef5ca2f7710ea66b8f84dd0f5f5351ecffe72b952cd9db71430"]).to.include(
            gasTokenMetadata.slice(offset, offset + 64)
        );
    }

    // Check bridge proxy Address is included in ger bytecode
    expect(oldGer.bytecode).to.include(bridgeProxy.address.toLowerCase().slice(2));

    // Update bridgeProxy storage
    gerProxy.contractName = gerContractName + " proxy";
    gerProxy.storage = await zkEVMDB2.dumpStorage(gerProxy.address);
    gerProxy.storage = Object.entries(gerProxy.storage).reduce((acc, [key, value]) => {
        acc[key] = padTo32Bytes(value);
        return acc;
    }, {});

    // CHECK GER PROXY STORAGE
    // Storage value of proxy implementation
    expect(gerProxy.storage["0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"]).to.include(
        oldGer.address.toLowerCase().slice(2)
    );

    // Storage value of proxyAdmin
    expect(gerProxy.storage["0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"]).to.include(
        proxyAdminObject.address.toLowerCase().slice(2)
    );

    // Storage value of global exit root updater
    expect(gerProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000034"]).to.include(
        globalExitRootUpdater.toLowerCase().slice(2)
    );
    if (ethers.isAddress(globalExitRootRemover) && globalExitRootRemover !== ethers.ZeroAddress) {
        // Storage value of global exit root updater
        expect(gerProxy.storage["0x0000000000000000000000000000000000000000000000000000000000000035"]).to.include(
            globalExitRootRemover.toLowerCase().slice(2)
        );
    }

    // Check bridge implementation includes TokenWrappedBridgeInitCode contract address
    expect(oldBridge.bytecode).to.include(precalculatedAddressDeployedSovereignBridge.toLowerCase().slice(2));

    // Create a new zkEVM to generate a genesis an empty system address storage
    const zkEVMDB3 = await ZkEVMDB.newZkEVM(
        new MemDB(F),
        poseidon,
        genesisRoot,
        accHashInput,
        genesis.genesis,
        null,
        null,
        chainID
    );
    // update genesis root
    genesis.root = smtUtils.h4toString(zkEVMDB3.getCurrentStateRoot());

    return genesis;
}

export default updateVanillaGenesis;
