import {expect} from "chai";
import {ethers} from "hardhat";
import fs from "fs";
import path from "path";
import shelljs from "shelljs";
import {ConsensusContracts} from "../src/pessimistic-utils";

const deployOutput = JSON.parse(fs.readFileSync(path.join(__dirname, "./deploymentOutput/deploy_output.json"), "utf8"));
const {polygonRollupManagerAddress, polygonZkEVMBridgeAddress, polygonZkEVMGlobalExitRootAddress, polTokenAddress} =
    deployOutput;
const createRollupOutput = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./deploymentOutput/create_rollup_output.json"), "utf8")
);
const {rollupAddress} = createRollupOutput;
import {
    PolygonRollupManager,
    PolygonPessimisticConsensus,
    PolygonValidiumEtrog,
    PolygonZkEVMEtrog,
} from "../typechain-types";

describe("Tooling docker build tests Contract", () => {
    it("Create a new rollup", async () => {
        // Read docker deployment output
        const dockerDeploymentOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, "./deploymentOutput/create_rollup_output.json"), "utf8")
        );
        // Read create rollup config file
        const createRollupConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, "../tools/createNewRollup/create_new_rollup.json.example"), "utf8")
        );

        // Update example config from docker deployment output
        createRollupConfig.consensusContractName = dockerDeploymentOutput.consensusContract;
        createRollupConfig.gasTokenAddress = dockerDeploymentOutput.gasTokenAddress;
        createRollupConfig.outputPath = "create_new_rollup_output.json";
        createRollupConfig.chainID = 12;
        fs.writeFileSync(
            path.join(__dirname, "../tools/createNewRollup/create_new_rollup.json"),
            JSON.stringify(createRollupConfig, null, 2)
        );

        // Run tool
        shelljs.exec("npx hardhat run ./tools/createNewRollup/createNewRollup.ts --network localhost");

        // Read create rollup output
        const createRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, "../tools/createNewRollup/create_new_rollup_output.json"), "utf8")
        );
        // Check output values with current docker environment
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager");
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            createRollupOutput.rollupManagerAddress
        ) as PolygonRollupManager;

        expect(createRollupConfig.rollupManagerAddress).to.equal(rollupManagerContract.target);
        // Get rollup data
        const rollupId = await rollupManagerContract.rollupAddressToID(createRollupOutput.rollupAddress);
        expect(Number(rollupId)).to.equal(createRollupOutput.rollupID);
        expect(await rollupManagerContract.chainIDToRollupID(createRollupConfig.chainID)).to.equal(
            createRollupOutput.rollupID
        );
        const rollupFactory = (await ethers.getContractFactory(createRollupConfig.consensusContractName)) as any;
        let rollupContract;
        switch (createRollupConfig.consensusContractName) {
            case ConsensusContracts.PolygonZkEVMEtrog:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonZkEVMEtrog;
                break;
            case ConsensusContracts.PolygonValidiumEtrog:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonValidiumEtrog;
                break;
            case ConsensusContracts.PolygonPessimisticConsensus:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonPessimisticConsensus;
                break;
            default:
                throw new Error("Invalid consensus contract");
        }

        expect(await rollupContract.rollupManager()).to.equal(createRollupConfig.rollupManagerAddress);
        expect(await rollupContract.gasTokenAddress()).to.equal(createRollupConfig.gasTokenAddress);
        expect(await rollupContract.trustedSequencer()).to.equal(createRollupConfig.trustedSequencer);
    });
});
