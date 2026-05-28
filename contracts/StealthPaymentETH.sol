// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC5564Announcer} from "./ERC5564Announcer.sol";

/// @notice Sends native ETH to a one-time stealth address and announces it in a
/// single transaction. The on-chain trace shows ETH going to a fresh, unlinkable
/// address; only the holder of the recipient's viewing key can detect that the
/// payment belongs to them, and only the spending key can move the funds.
///
/// Scheme 1 (secp256k1 + view tag) metadata convention used here:
///   metadata[0]      = view tag (1 byte) for fast scanning
///   metadata[1..33]  = 0xeeee...ee (native-ETH marker, 32 bytes, optional)
///   metadata[33..65] = amount in wei (uint256, optional)
contract StealthPaymentETH {
    ERC5564Announcer public immutable announcer;

    /// secp256k1 with view-tag, as registered for ERC-5564.
    uint256 public constant SCHEME_ID = 1;

    error ZeroValue();
    error EmptyEphemeralKey();
    error TransferFailed();

    event StealthPaymentSent(address indexed stealthAddress, address indexed from, uint256 amount);

    constructor(ERC5564Announcer _announcer) {
        announcer = _announcer;
    }

    /// @param stealthAddress  One-time address derived off-chain from the recipient's meta-address.
    /// @param ephemeralPubKey Sender's ephemeral public key (compressed, 33 bytes).
    /// @param metadata        View tag (first byte) plus optional transfer details.
    function sendEth(
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external payable {
        if (msg.value == 0) revert ZeroValue();
        if (ephemeralPubKey.length == 0) revert EmptyEphemeralKey();

        // Announce first so indexers see the event even if the recipient is a contract.
        announcer.announce(SCHEME_ID, stealthAddress, ephemeralPubKey, metadata);

        (bool ok, ) = payable(stealthAddress).call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit StealthPaymentSent(stealthAddress, msg.sender, msg.value);
    }
}
