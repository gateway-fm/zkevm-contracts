// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface ITransparentUpgradeableProxy {
    function changeAdmin(address newAdmin) external;
    function upgradeTo(address newImplementation) external;
}
