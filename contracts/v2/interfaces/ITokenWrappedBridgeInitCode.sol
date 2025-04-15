// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface ITokenWrappedBridgeInitCode {
    function BASE_INIT_BYTECODE_WRAPPED_TOKEN()
        external
        pure
        returns (bytes memory);

    function BASE_INIT_BYTECODE_WRAPPED_TOKEN_UPGRADEABLE()
        external
        pure
        returns (bytes memory);

    function POLYGON_TRANSPARENT_PROXY_INIT()
        external
        pure
        returns (bytes memory);
}
