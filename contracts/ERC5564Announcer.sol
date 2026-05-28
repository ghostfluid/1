// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical ERC-5564 announcer. Anyone can announce a stealth payment.
/// The announcement carries the data a recipient needs to scan the chain and
/// detect payments addressed to them, without ever publishing their identity.
contract ERC5564Announcer {
    /// @dev Emitted on every stealth payment announcement.
    /// @param schemeId Identifier of the stealth address scheme (1 = secp256k1, view-tag).
    /// @param stealthAddress The one-time address that received the funds.
    /// @param caller The address that emitted the announcement (e.g. the payment contract).
    /// @param ephemeralPubKey Sender's ephemeral public key (compressed, 33 bytes for scheme 1).
    /// @param metadata View tag (first byte) plus optional transfer details.
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external {
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
