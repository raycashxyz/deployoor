// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice LayerZero V2 endpoint — minimal surface for cross-chain send.
interface ILayerZeroEndpoint {
    function send(
        uint32 _dstEid,
        bytes32 _receiver,
        bytes calldata _message,
        bytes calldata _options,
        bool _payInLzToken
    ) external payable;
}

/// @title Ping
/// @notice Sepolia-side app that sends cross-chain pings via LayerZero.
/// @dev Production apps extend LayerZero OApp; this example keeps the deploy/peering flow visible.
contract Ping {
    ILayerZeroEndpoint public immutable endpoint;

    mapping(uint32 eid => bytes32 peer) public peers;

    event PingSent(uint32 indexed dstEid, string message);
    event PeerSet(uint32 indexed eid, bytes32 peer);

    constructor(address _endpoint) {
        endpoint = ILayerZeroEndpoint(_endpoint);
    }

    function setPeer(uint32 _eid, bytes32 _peer) external {
        peers[_eid] = _peer;
        emit PeerSet(_eid, _peer);
    }

    /// @notice Send a ping to a peer on another chain.
    function ping(uint32 _dstEid, string calldata _message) external payable {
        bytes32 peer = peers[_dstEid];
        require(peer != bytes32(0), "Ping: peer not set");

        bytes memory payload = abi.encode(_message);
        endpoint.send{value: msg.value}(_dstEid, peer, payload, "", false);

        emit PingSent(_dstEid, _message);
    }
}
