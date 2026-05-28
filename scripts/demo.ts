import { ethers } from "hardhat";
import {
  generateStealthKeys,
  generateStealthAddress,
  checkStealthAddress,
  computeStealthPrivateKey,
  buildMetadata,
} from "../lib/stealth";

// End-to-end walkthrough on the in-memory Hardhat network.
async function main() {
  const [sender] = await ethers.getSigners();

  const announcer = await (await ethers.getContractFactory("ERC5564Announcer")).deploy();
  const payment = await (
    await ethers.getContractFactory("StealthPaymentETH")
  ).deploy(await announcer.getAddress());

  console.log("== Recipient sets up keys ==");
  const recipient = generateStealthKeys();
  console.log("meta-address:", recipient.metaAddress);

  console.log("\n== Sender derives a one-time address ==");
  const stealth = generateStealthAddress(recipient.metaAddress);
  console.log("stealth address:", ethers.getAddress(stealth.stealthAddress));
  console.log("ephemeral pubkey:", stealth.ephemeralPublicKey);
  console.log("view tag:", stealth.viewTag);

  const amount = ethers.parseEther("1");
  await (
    await payment
      .connect(sender)
      .sendEth(ethers.getAddress(stealth.stealthAddress), stealth.ephemeralPublicKey, buildMetadata(stealth.viewTag, amount), {
        value: amount,
      })
  ).wait();
  console.log("\nPaid 1 ETH. Stealth balance:", ethers.formatEther(await ethers.provider.getBalance(stealth.stealthAddress)));

  console.log("\n== Recipient scans and recovers control ==");
  const scan = checkStealthAddress(
    { viewingPrivateKey: recipient.viewingPrivateKey, spendingPublicKey: recipient.spendingPublicKey },
    stealth.ephemeralPublicKey,
    stealth.viewTag
  );
  console.log("detected as mine:", scan.isForMe);

  const priv = computeStealthPrivateKey(
    { spendingPrivateKey: recipient.spendingPrivateKey, viewingPrivateKey: recipient.viewingPrivateKey },
    stealth.ephemeralPublicKey
  );
  const wallet = new ethers.Wallet(priv, ethers.provider);
  console.log("recovered controller:", wallet.address, "matches:", wallet.address === ethers.getAddress(stealth.stealthAddress));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
