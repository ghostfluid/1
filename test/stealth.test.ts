import { expect } from "chai";
import { ethers } from "hardhat";
import {
  generateStealthKeys,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthPrivateKey,
  metaAddressToBytes,
  decodeMetaAddress,
  encodeMetaAddress,
  buildMetadata,
  parseViewTag,
} from "../lib/stealth";

async function deploy() {
  const Announcer = await ethers.getContractFactory("ERC5564Announcer");
  const announcer = await Announcer.deploy();

  const Registry = await ethers.getContractFactory("ERC6538Registry");
  const registry = await Registry.deploy();

  const Payment = await ethers.getContractFactory("StealthPaymentETH");
  const payment = await Payment.deploy(await announcer.getAddress());

  return { announcer, registry, payment };
}

describe("ERC-5564 stealth payments (native ETH on Base)", () => {
  it("derives a stealth address the recipient can detect and spend", async () => {
    const { announcer, payment } = await deploy();
    const [sender] = await ethers.getSigners();

    // 1) Recipient creates their stealth meta-address (spend + view keys).
    const recipient = generateStealthKeys();

    // 2) Sender derives a fresh one-time address from the public meta-address only.
    const stealth = generateStealthAddress(recipient.metaAddress);
    const amount = ethers.parseEther("0.5");
    const metadata = buildMetadata(stealth.viewTag, amount);

    // 3) Sender pays + announces in one tx.
    const tx = await payment
      .connect(sender)
      .sendEth(ethers.getAddress(stealth.stealthAddress), stealth.ephemeralPublicKey, metadata, {
        value: amount,
      });
    await expect(tx)
      .to.emit(announcer, "Announcement")
      .withArgs(
        1,
        ethers.getAddress(stealth.stealthAddress),
        await payment.getAddress(),
        stealth.ephemeralPublicKey,
        metadata
      );

    // ETH actually landed at the one-time address.
    expect(await ethers.provider.getBalance(stealth.stealthAddress)).to.equal(amount);
    expect(parseViewTag(metadata)).to.equal(stealth.viewTag);

    // 4) Recipient scans the announcement with only the VIEWING key.
    const scan = checkStealthAddress(
      { viewingPrivateKey: recipient.viewingPrivateKey, spendingPublicKey: recipient.spendingPublicKey },
      stealth.ephemeralPublicKey,
      stealth.viewTag
    );
    expect(scan.isForMe).to.equal(true);
    expect(ethers.getAddress(scan.stealthAddress)).to.equal(ethers.getAddress(stealth.stealthAddress));

    // 5) Recipient recovers the controlling private key (needs spend + view key).
    const stealthPriv = computeStealthPrivateKey(
      { spendingPrivateKey: recipient.spendingPrivateKey, viewingPrivateKey: recipient.viewingPrivateKey },
      stealth.ephemeralPublicKey
    );
    const stealthWallet = new ethers.Wallet(stealthPriv, ethers.provider);
    expect(stealthWallet.address).to.equal(ethers.getAddress(stealth.stealthAddress));

    // 6) Recipient spends from the stealth address (pays its own gas from the received ETH).
    const sink = ethers.Wallet.createRandom().address;
    const sweepValue = ethers.parseEther("0.4");
    await stealthWallet.sendTransaction({ to: sink, value: sweepValue });
    expect(await ethers.provider.getBalance(sink)).to.equal(sweepValue);
  });

  it("does not match payments addressed to a different recipient", async () => {
    const alice = generateStealthKeys();
    const bob = generateStealthKeys();

    const toAlice = generateStealthAddress(alice.metaAddress);

    const bobScan = checkStealthAddress(
      { viewingPrivateKey: bob.viewingPrivateKey, spendingPublicKey: bob.spendingPublicKey },
      toAlice.ephemeralPublicKey,
      toAlice.viewTag
    );
    expect(bobScan.isForMe).to.equal(false);
  });

  it("round-trips the meta-address encoding", () => {
    const k = generateStealthKeys();
    const { spendingPub, viewingPub } = decodeMetaAddress(k.metaAddress);
    expect(encodeMetaAddress(spendingPub, viewingPub)).to.equal(k.metaAddress);
    expect(metaAddressToBytes(k.metaAddress)).to.have.length(2 + (33 + 33) * 2);
  });

  it("stores and reads a meta-address from the ERC-6538 registry", async () => {
    const { registry } = await deploy();
    const [recipientSigner] = await ethers.getSigners();
    const keys = generateStealthKeys();
    const metaBytes = metaAddressToBytes(keys.metaAddress);

    await registry.connect(recipientSigner).registerKeys(1, metaBytes);
    const stored = await registry.stealthMetaAddressOf(recipientSigner.address, 1);
    expect(stored).to.equal(metaBytes);
  });

  it("reverts on a zero-value or empty-key payment", async () => {
    const { payment } = await deploy();
    const stealth = generateStealthAddress(generateStealthKeys().metaAddress);

    await expect(
      payment.sendEth(ethers.getAddress(stealth.stealthAddress), stealth.ephemeralPublicKey, "0x00", {
        value: 0,
      })
    ).to.be.revertedWithCustomError(payment, "ZeroValue");

    await expect(
      payment.sendEth(ethers.getAddress(stealth.stealthAddress), "0x", "0x00", {
        value: ethers.parseEther("0.1"),
      })
    ).to.be.revertedWithCustomError(payment, "EmptyEphemeralKey");
  });
});
