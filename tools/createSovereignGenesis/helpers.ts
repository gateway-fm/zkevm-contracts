const formatOutputs = ["geth"];

/**
 * Format genesis file to a specific format
 * @param genesis original legacy genesis file
 * @param format Format type
 * @returns new genesis format
 */
function formatGenesis(genesis: { genesis: any[]; }, format: any){
    switch (format) {
        case "geth":
            return _formatGeth(genesis);
        default:
            throw new Error(`formatGenesis: unknown format: ${format}`);
    }
}

/**
 * Format legacy genesis file to geth format
 * @param genesis legacy genesis file
 * @returns Geth genesis format
 */
function _formatGeth(genesis: { genesis: any[]; }) {
    return genesis.genesis.reduce((acc, contract) => {
        acc[contract.address] = {
            "code": contract.bytecode,
            "storage": contract.storage,
            "balance": `0x${BigInt(contract.balance).toString(16)}`,
            "nonce": `0x${BigInt(contract.nonce).toString(16)}`
        };
        return acc;
    }, {});
}

import { execSync } from "child_process";

/**
 * Retrieves the current Git commit hash and repository URL
 * @returns An object containing the commit hash and repository URL, or null if an error occurs
 */
function getGitInfo(): { commit: string; repo: string } | null {
    try {
      // Get the latest commit hash
      const commit = execSync("git rev-parse HEAD").toString().trim();

      // Get the repository URL
      const repo = execSync("git config --get remote.origin.url").toString().trim();

      return { commit, repo };
    } catch (error) {
        throw new Error(`getGitInfo: ${error}`);
    }
  }

module.exports = {
    formatGenesis,
    getGitInfo,
};