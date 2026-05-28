# base-stealth-eth

**Monero-style recipient privacy** on the **Base** network, using the **ERC-5564 (stealth address)** standard for **native ETH** transfers. Educational project — contracts + tests, no ZK circuit.

> Ethics & legal note: this is for privacy research/education. Privacy tooling is dual-use and is heavily regulated in some jurisdictions. Do not deploy to mainnet without understanding local regulations (AML/sanctions). This is NOT audited / production-ready.

## How it works (Monero analogy)

| Monero | This project |
| --- | --- |
| spend key | `spendingPrivateKey` — used to spend funds |
| view key | `viewingPrivateKey` — used only to detect incoming funds |
| tx public key | `ephemeralPublicKey` published by the sender |
| one-time output | a single-use stealth address per payment |

Flow: the recipient publishes a **meta-address** (spending pub + viewing pub). The sender uses the public meta-address to derive a **fresh stealth address** via secp256k1 ECDH, sends ETH to it, and announces it via `ERC5564Announcer`. Only the holder of the **viewing key** can detect that a payment is theirs; only the **spending key** can move the funds. There is no on-chain link between the recipient's identity and the addresses that receive funds.

> What is **hidden**: the recipient's identity / linkability. What is **not** hidden: the sender's address and the amount (unlike Monero's RingCT). Hiding the sender and amount as well requires a ZK-based shielded pool.

## Contracts

- `contracts/ERC5564Announcer.sol` — emits the `Announcement` event for recipients to scan.
- `contracts/ERC6538Registry.sol` — stealth meta-address registry (incl. EIP-712 / EIP-1271 `registerKeysOnBehalf`).
- `contracts/StealthPaymentETH.sol` — sends ETH to a stealth address + announces it in a single tx.
- `lib/stealth.ts` — off-chain stealth-address cryptography (generate / derive / scan / recover).

## Commands

```bash
npm install
npm run build      # compile contracts
npm test           # unit tests (Hardhat + chai)
npm run demo       # end-to-end walkthrough on the in-memory network
# deploy to testnet (fill in .env first):
npm run deploy:baseSepolia
```
