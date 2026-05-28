import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying to ${network.name} with ${deployer.address}`);

  const announcer = await (await ethers.getContractFactory("ERC5564Announcer")).deploy();
  await announcer.waitForDeployment();
  console.log("ERC5564Announcer:", await announcer.getAddress());

  const registry = await (await ethers.getContractFactory("ERC6538Registry")).deploy();
  await registry.waitForDeployment();
  console.log("ERC6538Registry:", await registry.getAddress());

  const payment = await (
    await ethers.getContractFactory("StealthPaymentETH")
  ).deploy(await announcer.getAddress());
  await payment.waitForDeployment();
  console.log("StealthPaymentETH:", await payment.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
