// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface ITokenWrappedBridgeInitCode {
    function TOKEN_WRAPPED_PROXY_INIT() external pure returns (bytes memory);
}
