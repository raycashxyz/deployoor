// Minimal Hardhat v2 project. The @deployoor/hardhat plugin regenerates the typed deployers
// from `artifacts/` automatically after every `hardhat compile` — no separate generate step.
require("@deployoor/hardhat");

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: "0.8.24",
};
