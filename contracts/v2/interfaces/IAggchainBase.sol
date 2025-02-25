// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IAggchainBaseEvents {
    /**
     * @notice Emitted when the admin adds an aggchain verification key.
     * @param selector The selector of the verification key to add.
     * @param newAggchainVKey The new aggchain verification key.
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);
    /**
     * @notice Emitted when the admin updates the aggchain verification key.
     * @param selector The selector of the verification key to update.
     * @param previousAggchainVKey The previous aggchain verification key.
     * @param newAggchainVKey The new new aggchain verification key.
     */
    event UpdateAggchainVKey(bytes4 selector, bytes32 previousAggchainVKey, bytes32 newAggchainVKey);
    /**
     * @notice Emitted when the admin switches the use of the default gateway to manage the aggchain keys.
     * @param useDefaultGateway The result of the switch.
     */
    event UpdateUseDefaultGatewayFlag(bool useDefaultGateway);
    /**
     * @notice Emitted when the vKeyManager starts the two-step transfer role setting a new pending vKeyManager.
     * @param newVKeyManager The new vKeyManager.
     */
    event TransferVKeyManagerRole(address newVKeyManager);
    /**
     * @notice Emitted when the pending vKeyManager accepts the vKeyManager role.
     * @param newVKeyManager The new vKeyManager.
     */
    event AcceptVKeyManagerRole(address newVKeyManager);
}

interface IAggchainBaseErrors {
    /// @notice Thrown when trying to add zero value verification key.
    error ZeroValueAggchainVKey();
    /// @notice Thrown when trying to add an aggchain verification key that already exists.
    error OwnedAggchainVKeyAlreadyAdded();
    /// @notice Thrown when trying to retrieve an aggchain verification key that does not exist.
    error OwnedAggchainVKeyNotFound();
    /// @notice Thrown when trying to initialize the incorrect initialize function.
    error InvalidInitializeFunction();
    /// @notice Thrown when trying to enable or disable the default gateway when it is already set.
    error UseDefaultGatewayAlreadySet();
    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();
    /// @notice Thrown when trying to call a function that only the VKeyManager can call.
    error OnlyVKeyManager();
    /// @notice Thrown when trying to call a function that only the pending VKeyManager can call.
    error OnlyPendingVKeyManager();
    /// @notice Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists.
    error AggchainVKeyNotFound();
    /// @notice owned vKeys and selectors length mismatch.
    error OwnedAggchainVKeyLengthMismatch();
}
/**
 * @title IAggchainBase
 * @notice Shared interface for native aggchain implementations.
 */
interface IAggchainBase is IAggchainBaseErrors, IAggchainBaseEvents {}
