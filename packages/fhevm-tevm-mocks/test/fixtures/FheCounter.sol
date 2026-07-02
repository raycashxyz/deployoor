// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {CoprocessorConfig} from "@fhevm/solidity/lib/Impl.sol";

contract FheCounter {
    euint32 private total;

    constructor(address acl, address coprocessor, address kmsVerifier) {
        FHE.setCoprocessor(
            CoprocessorConfig({ACLAddress: acl, CoprocessorAddress: coprocessor, KMSVerifierAddress: kmsVerifier})
        );
    }

    function add(externalEuint32 encryptedValue, bytes calldata inputProof) external {
        euint32 value = FHE.fromExternal(encryptedValue, inputProof);

        total = FHE.add(total, value);
        FHE.allowThis(total);
        FHE.makePubliclyDecryptable(total);
    }

    function encryptedTotal() external view returns (euint32) {
        return total;
    }
}
