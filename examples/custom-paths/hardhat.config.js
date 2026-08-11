// Every path in this project is moved off the default. Hardhat is told once, here — and deployoor
// reads `paths.artifacts` out of this file, so it needs no configuration of its own to find them.
require("@deployoor/hardhat");

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: "0.8.24",
  paths: {
    sources: "src/contracts",
    artifacts: "build/artifacts",
    cache: "build/cache",
  },
};
