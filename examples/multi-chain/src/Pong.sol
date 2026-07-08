// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice LayerZero V2 endpoint — minimal surface for cross-chain receive wiring.
interface ILayerZeroEndpoint {
    function setDelegate(address _delegate) external;
}

/// @title Pong
/// @notice Base Sepolia-side app that receives pings and can reply via LayerZero.
/// @dev Production apps extend LayerZero OApp with `_lzReceive`; peers are set the same way.
contract Pong {
    ILayerZeroEndpoint public immutable endpoint;

    mapping(uint32 eid => bytes32 peer) public peers;

    string public lastMessage;
    uint32 public lastSrcEid;

    event PongReceived(uint32 indexed srcEid, string message);
    event PeerSet(uint32 indexed eid, bytes32 peer);

    constructor(address _endpoint) {
        endpoint = ILayerZeroEndpoint(_endpoint);
    }

    function setPeer(uint32 _eid, bytes32 _peer) external {
        peers[_eid] = _peer;
        emit PeerSet(_eid, _peer);
    }

    /// @notice Record an inbound ping (stand-in for OApp `_lzReceive` in production).
    function onPing(uint32 _srcEid, string calldata _message) external {
        lastSrcEid = _srcEid;
        lastMessage = _message;
        emit PongReceived(_srcEid, _message);
    }
}
