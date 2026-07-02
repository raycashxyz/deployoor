// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public number;

    constructor(uint256 initial) {
        number = initial;
    }

    function increment() external {
        number += 1;
    }

    function setNumber(uint256 n) external {
        number = n;
    }
}
