/**
 * ERC-5564 scheme 1 (secp256k1 + view tag) stealth-address cryptography.
 *
 * This is the off-chain half of the system: it never touches a private key
 * on-chain. A recipient has two key pairs — a *spending* key and a *viewing*
 * key — combined into a "stealth meta-address". A sender uses only the public
 * meta-address to derive a fresh one-time address per payment, so on-chain there
 * is no link between the recipient's identity and the addresses they receive at.
 *
 * Mapping to Monero concepts:
 *   spending key  ~ Monero spend key  (authorizes moving funds)
 *   viewing key   ~ Monero view  key  (detects incoming funds, cannot spend)
 *   ephemeral key ~ the tx public key the sender publishes
 *   stealth addr  ~ Monero one-time output address
 */
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

const { ProjectivePoint, CURVE, getPublicKey, getSharedSecret, utils } = secp;
const N = CURVE.n;

export interface StealthKeys {
  spendingPrivateKey: Uint8Array; // keep secret; required to spend
  viewingPrivateKey: Uint8Array; // keep secret; required to detect payments
  spendingPublicKey: Uint8Array; // 33-byte compressed
  viewingPublicKey: Uint8Array; // 33-byte compressed
  /** Encoded "st:base:0x<spendingPub><viewingPub>" meta-address. */
  metaAddress: string;
}

export interface StealthPayment {
  /** 0x-prefixed one-time recipient address (lowercase). */
  stealthAddress: string;
  /** Sender's ephemeral public key, 33-byte compressed, 0x-prefixed. */
  ephemeralPublicKey: string;
  /** Single byte (0-255) used by recipients for fast scanning. */
  viewTag: number;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const toHex = (b: Uint8Array): string =>
  "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const fromHex = (h: string): Uint8Array => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const bytesToBigInt = (b: Uint8Array): bigint => {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
};

const bigIntTo32 = (x: bigint): Uint8Array => {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
};

/** Reduce a hashed shared secret to a valid non-zero scalar mod n. */
const toScalar = (hash: Uint8Array): bigint => {
  const s = bytesToBigInt(hash) % N;
  return s === 0n ? 1n : s;
};

/** Derive a 0x address (lowercase) from a secp256k1 point. */
const addressFromPoint = (point: secp.ProjectivePoint): string => {
  const uncompressed = point.toRawBytes(false); // 65 bytes: 0x04 || X || Y
  const hash = keccak_256(uncompressed.slice(1)); // hash X||Y
  return toHex(hash.slice(12)); // last 20 bytes
};

// ---------------------------------------------------------------------------
// recipient: generate keys / meta-address
// ---------------------------------------------------------------------------

export function generateStealthKeys(): StealthKeys {
  const spendingPrivateKey = utils.randomPrivateKey();
  const viewingPrivateKey = utils.randomPrivateKey();
  const spendingPublicKey = getPublicKey(spendingPrivateKey, true);
  const viewingPublicKey = getPublicKey(viewingPrivateKey, true);
  return {
    spendingPrivateKey,
    viewingPrivateKey,
    spendingPublicKey,
    viewingPublicKey,
    metaAddress: encodeMetaAddress(spendingPublicKey, viewingPublicKey),
  };
}

/** "st:base:0x" || spendingPub(33) || viewingPub(33). */
export function encodeMetaAddress(spendingPub: Uint8Array, viewingPub: Uint8Array): string {
  return "st:base:" + toHex(spendingPub) + toHex(viewingPub).slice(2);
}

export function decodeMetaAddress(meta: string): { spendingPub: Uint8Array; viewingPub: Uint8Array } {
  const hex = meta.replace(/^st:base:/, "").replace(/^0x/, "");
  if (hex.length !== 132) throw new Error("invalid meta-address length");
  return {
    spendingPub: fromHex(hex.slice(0, 66)),
    viewingPub: fromHex(hex.slice(66)),
  };
}

/** Bytes form for the ERC-6538 registry: spendingPub(33) || viewingPub(33). */
export function metaAddressToBytes(meta: string): string {
  const { spendingPub, viewingPub } = decodeMetaAddress(meta);
  return toHex(new Uint8Array([...spendingPub, ...viewingPub]));
}

// ---------------------------------------------------------------------------
// sender: derive a one-time stealth address
// ---------------------------------------------------------------------------

export function generateStealthAddress(metaAddress: string): StealthPayment {
  const { spendingPub, viewingPub } = decodeMetaAddress(metaAddress);

  const ephemeralPriv = utils.randomPrivateKey();
  const ephemeralPub = getPublicKey(ephemeralPriv, true);

  // ECDH shared secret with the recipient's *viewing* key.
  const shared = getSharedSecret(ephemeralPriv, viewingPub, true);
  const sHash = keccak_256(shared);
  const viewTag = sHash[0];

  // stealthPub = spendingPub + sHash * G
  const stealthPoint = ProjectivePoint.fromHex(toHex(spendingPub).slice(2)).add(
    ProjectivePoint.BASE.multiply(toScalar(sHash))
  );

  return {
    stealthAddress: addressFromPoint(stealthPoint),
    ephemeralPublicKey: toHex(ephemeralPub),
    viewTag,
  };
}

// ---------------------------------------------------------------------------
// recipient: scan announcements & recover the spend key
// ---------------------------------------------------------------------------

/**
 * Returns true (and the derived stealth address) if the announced payment
 * belongs to this recipient. Only the viewing key is needed to scan.
 */
export function checkStealthAddress(
  keys: Pick<StealthKeys, "viewingPrivateKey" | "spendingPublicKey">,
  ephemeralPublicKey: string,
  viewTag: number
): { isForMe: boolean; stealthAddress: string } {
  const shared = getSharedSecret(keys.viewingPrivateKey, fromHex(ephemeralPublicKey), true);
  const sHash = keccak_256(shared);

  if (sHash[0] !== viewTag) return { isForMe: false, stealthAddress: "" };

  const stealthPoint = ProjectivePoint.fromHex(toHex(keys.spendingPublicKey).slice(2)).add(
    ProjectivePoint.BASE.multiply(toScalar(sHash))
  );
  return { isForMe: true, stealthAddress: addressFromPoint(stealthPoint) };
}

/**
 * Recovers the private key that controls a stealth address. Requires BOTH the
 * spending and viewing private keys — this is the step only the recipient can do.
 * stealthPriv = (spendingPriv + sHash) mod n
 */
export function computeStealthPrivateKey(
  keys: Pick<StealthKeys, "spendingPrivateKey" | "viewingPrivateKey">,
  ephemeralPublicKey: string
): string {
  const shared = getSharedSecret(keys.viewingPrivateKey, fromHex(ephemeralPublicKey), true);
  const sHash = keccak_256(shared);
  const stealthPriv = (bytesToBigInt(keys.spendingPrivateKey) + toScalar(sHash)) % N;
  return toHex(bigIntTo32(stealthPriv));
}

// ---------------------------------------------------------------------------
// metadata encoding for the announcer
// ---------------------------------------------------------------------------

const NATIVE_ETH_MARKER = "ee".repeat(32);

/** metadata = viewTag(1) || 0xee..ee(32) || amountWei(32). */
export function buildMetadata(viewTag: number, amountWei: bigint): string {
  const tag = viewTag.toString(16).padStart(2, "0");
  const amount = toHex(bigIntTo32(amountWei)).slice(2);
  return "0x" + tag + NATIVE_ETH_MARKER + amount;
}

export function parseViewTag(metadata: string): number {
  return parseInt(metadata.replace(/^0x/, "").slice(0, 2), 16);
}
