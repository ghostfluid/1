# base-stealth-eth

> Recipient privacy for **native ETH** on the **Base** network, built on the **ERC-5564 stealth address** standard. Educational project — contracts + tests, no ZK circuit.

<p>
  <img alt="Solidity" src="https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity&logoColor=white" />
  <img alt="Hardhat" src="https://img.shields.io/badge/Hardhat-2.22-fff100?logo=hardhat&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.4-3178c6?logo=typescript&logoColor=white" />
  <img alt="ethers.js" src="https://img.shields.io/badge/ethers.js-v6-2535a0?logo=ethereum&logoColor=white" />
  <img alt="Base" src="https://img.shields.io/badge/Base-L2-0052ff?logo=coinbase&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-5fa04e?logo=nodedotjs&logoColor=white" />
  <img alt="Standard" src="https://img.shields.io/badge/EIP-5564%20%2F%206538-627eea" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

> Ethics & legal note: this is for privacy research/education. Privacy tooling is dual-use and is heavily regulated in some jurisdictions. Do not deploy to mainnet without understanding local regulations (AML/sanctions). This is NOT audited / production-ready.

## Concept

A stealth address lets someone receive ETH on Base without linking the payments to a single, publicly known address.

The recipient holds two key pairs:

| Key | Role |
| --- | --- |
| **spending key** | authorizes moving the received funds |
| **viewing key** | only detects which incoming payments belong to them — cannot spend |

These two public keys are combined into a single **meta-address** that the recipient publishes once (e.g. in the on-chain `ERC6538Registry`).

**Sending:** the sender takes the recipient's public meta-address, generates a random ephemeral key, and via secp256k1 ECDH derives a brand-new **one-time stealth address** plus a published `ephemeralPublicKey`. ETH is sent to that fresh address and the payment is announced through `ERC5564Announcer`.

**Receiving:** the recipient scans `Announcement` events. Using only the **viewing key** they can tell which announcements are addressed to them (a one-byte *view tag* makes scanning fast). Using both keys they recover the private key that controls the stealth address and can spend the funds.

> What is **hidden**: the link between the recipient's identity and the addresses that receive funds. What is **not** hidden: the sender's address and the transferred amount. Hiding the sender and amount as well would require a ZK-based shielded pool.

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
