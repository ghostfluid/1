// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-6538 stealth meta-address registry.
/// Lets a recipient publish their stealth meta-address (spending pubkey + viewing
/// pubkey) once, so senders can look it up and derive one-time stealth addresses.
contract ERC6538Registry {
    /// @dev registrant => schemeId => stealth meta-address bytes.
    mapping(address => mapping(uint256 => bytes)) public stealthMetaAddressOf;

    /// @dev registrant => nonce, used for registerKeysOnBehalf (EIP-712 / EIP-1271).
    mapping(address => uint256) public nonceOf;

    bytes32 public constant ERC6538REGISTRY_ENTRY_TYPE_HASH =
        keccak256("Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)");

    bytes32 private immutable _DOMAIN_SEPARATOR;

    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    error InvalidSignature();

    constructor() {
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ERC6538Registry"),
                keccak256("1.0"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Register the caller's own stealth meta-address.
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        stealthMetaAddressOf[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Register a meta-address on behalf of `registrant` with their EIP-712 signature.
    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes calldata signature,
        bytes calldata stealthMetaAddress
    ) external {
        bytes32 structHash = keccak256(
            abi.encode(
                ERC6538REGISTRY_ENTRY_TYPE_HASH,
                schemeId,
                keccak256(stealthMetaAddress),
                nonceOf[registrant]
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));

        if (!_isValidSignature(registrant, digest, signature)) revert InvalidSignature();

        unchecked {
            ++nonceOf[registrant];
        }
        stealthMetaAddressOf[registrant][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(registrant, schemeId, stealthMetaAddress);
    }

    /// @notice Lets a registrant invalidate outstanding signatures by bumping their nonce.
    function incrementNonce() external {
        unchecked {
            ++nonceOf[msg.sender];
        }
        emit NonceIncremented(msg.sender, nonceOf[msg.sender]);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }

    function _isValidSignature(address signer, bytes32 digest, bytes calldata signature)
        private
        view
        returns (bool)
    {
        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(signature.offset)
                s := calldataload(add(signature.offset, 32))
                v := byte(0, calldataload(add(signature.offset, 64)))
            }
            address recovered = ecrecover(digest, v, r, s);
            if (recovered != address(0) && recovered == signer) return true;
        }
        // EIP-1271 fallback for smart-contract wallets.
        if (signer.code.length > 0) {
            (bool ok, bytes memory ret) = signer.staticcall(
                abi.encodeWithSelector(0x1626ba7e, digest, signature)
            );
            return ok && ret.length == 32 && bytes4(ret) == 0x1626ba7e;
        }
        return false;
    }
}
