# Twosome

A messenger for exactly two people. No accounts, no server storing your messages, and everything is gone in 48 hours.

Built at Punk Software Hack Night #9 (SF Tech Week).

## What it does
- **Pair with a 4-word code.** One person starts a room, the other joins with the code. A third person is refused.
- **Peer to peer.** Messages go straight between the two browsers over WebRTC (PeerJS). The PeerJS cloud server only introduces the two browsers; it never sees messages.
- **48-hour expiry.** Each message shows a live countdown and is deleted from the device when it runs out.
- **Poke.** A pulse and a phone vibration on the other side.
- **Shared scratchpad.** A text box that stays in sync between the two of you.
- **Leave = wipe.** One button clears everything on your device.

## Run it
```
cd twosome
python3 -m http.server 8000
```
Open `http://localhost:8000` in two browsers (or on two phones on the same Wi-Fi, using your laptop's IP). WebRTC needs HTTPS or localhost, so for phones use a tunnel such as `npx localtunnel --port 8000`.

## Honest limits
- Signaling uses the free public PeerJS server. Self-host `peerjs-server` if you want zero third parties.
- Messages exist only on the two devices, so a message sent while the other person is offline is not delivered later.
- Expiry is enforced by each client, which is a trust-your-partner model, not a guarantee.

## Tags
`#punksoftware`
