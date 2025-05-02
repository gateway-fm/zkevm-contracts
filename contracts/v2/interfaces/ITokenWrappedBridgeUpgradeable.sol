// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

interface ITokenWrappedBridgeUpgradeable {
    function initialize(
        string memory name,
        string memory symbol,
        uint8 __decimals
    ) external;

    function mint(address to, uint256 value) external;
    function burn(address account, uint256 value) external;
}
