# Full-project Beta 2 release

Use START-HERE.txt for this full ZIP. The additive-installer steps below apply only to the older small update ZIP. This release fixes the invalid .info GET by using an onValue listener, adds host-only playerOrder writes for auction start, and includes predictions rules.

# CricAuction V7 Beta — optional room voice update

This is an additive update for the existing V7 Beta project. It preserves your game features and can be applied over other edits. Voice is available after choosing a team in the lobby, during the auction, and on the summary/tournament page. Moving between these pages in the same room keeps the call; leaving the room, logging out, being removed, closing the tab, or losing the Firebase connection stops the microphone.

## Install on your existing project

1. Extract the downloaded ZIP. Put its `voice-update` folder inside your current project, beside `package.json`.
2. In the VS Code terminal, in that project, run:

```powershell
node voice-update/install-voice.mjs
```

The installer backs up changed files in `.voice-backups`, adds the new voice files, inserts the component inside your existing providers, and merges the voice-only rules and API route. It does not replace your auction screens, player data, match engine, or `.env`. If the app/config structure is unexpected, it stops before making changes. A repeated install backs up any existing voice file before replacing it. Keep backups out of Git.

3. **Required once:** open Firebase Console → your existing project → Realtime Database → Rules. Publish the updated `database.rules.json` contents. Use the merged file from YOUR project after installation, so your other rules remain intact. If the live console has rules newer than your local file, merge only the `voiceRooms` entry into the live rules instead of replacing them. Do not make the database public.
4. Restart the local server with `npm run dev`. Open Chrome at the printed localhost URL. For phones or friends on other devices, use the deployed **HTTPS** site. A phone's HTTP LAN IP URL cannot request a microphone.
5. Both friends join the same auction room, choose teams, expand **Room voice**, and press **Join voice**. Allow microphone permission. Each mic begins muted: press its mic button to speak.

## Controls

- Join voice: optional, never auto-starts the microphone on page load.
- Mic: turns your outgoing audio on/off. Does not affect other players.
- Mute friends / Hear friends: mutes/unmutes all incoming voice locally; your mic is a separate control.
- Per-friend speaker: locally mute just that friend.
- Friends volume: controls incoming voice volume (mobile browsers may use device volume instead).
- Leave / Cancel: stops microphone capture and releases peer connections.
- Tap to hear friends: appears when the browser blocks automatic playback.
- Retry connection: creates a fresh session if connection retries fail.

Use headphones. Closing the panel only collapses it; the visible mic button still shows whether your mic is on. Muting disables the audio track but the browser may retain its mic permission indicator; **Leave** releases the microphone device completely.

## Internet reliability / TURN relay

**Direct voice is implemented, but it is not guaranteed to connect across mobile/carrier/restricted networks without TURN. No relay account or credentials are included.** Firebase handles room connection messages only, not the audio relay. `npm run dev` has no Vercel function, so it uses STUN/direct connectivity. The existing static ChatGPT test site does not host the new server function.

For reliable hosted use, configure a coturn-compatible TURN service using TURN REST HMAC credentials. The included Vercel function `api/voice-ice.js` creates one-hour credentials after verifying the Firebase user and room membership. Credentials refresh every 30 minutes while connected. It never returns the shared signing secret.

Set these in your Vercel project's server environment, then redeploy:

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | Your existing Firebase project ID (or reuse `VITE_FIREBASE_PROJECT_ID`) |
| `FIREBASE_DATABASE_URL` | Your existing HTTPS Realtime Database URL (or reuse `VITE_FIREBASE_DATABASE_URL`) |
| `TURN_URLS` | Comma-separated actual relay URLs, e.g. `turn:YOUR_HOST:3478?transport=udp,turn:YOUR_HOST:3478?transport=tcp,turns:YOUR_HOST:5349?transport=tcp` |
| `TURN_SHARED_SECRET` | Matching TURN REST secret from your coturn-compatible service |

Never prefix `TURN_SHARED_SECRET` with `VITE_`, commit it, or place it in client source. coturn must use `use-auth-secret` with the matching `static-auth-secret`, a valid realm, correct public IP/NAT settings, TLS certificate for TURN-over-TLS, and open configured relay ports. Existing managed services that only expose API keys/static username/password are not automatically compatible with this endpoint. You need a relay/service administrator to supply the matching configuration. Set provider quotas/monitoring appropriate to your group; bandwidth/service fees may apply.

When no TURN configuration is present, the deployed endpoint returns STUN/direct connectivity. Partially configured relay credentials fail explicitly. No TURN server has been provisioned or verified as part of this source update.

## Validation performed

- 12 voice unit tests: real track enable/stop state using mocked media; permission failure; late permission cancellation; network loss; SDP/ICE ordering; simultaneous negotiation via an in-memory signalling hub; stale/duplicate sessions; late events; TURN HMAC/expiry; endpoint input/auth rejection.
- Offline React DOM test: opt-in join, microphone toggle, per-friend mute before a track arrives, all-friends mute, blocked autoplay recovery, leave, rejoin, page exit cleanup.
- Existing 26 Phase 2/3 tests pass; production Vite build passes. Existing large-bundle warning remains.
- **Not tested:** physical microphones/speakers, actual two-device WebRTC transport, live Firebase rule deployment, live TURN relay, or mobile network/audio behavior. No claim of completed live voice QA.

Run unit tests with `npm run test:voice` after installation. UI test requires a separate jsdom installation and `PHASE3_QA_MODULES` pointing to its directory; it is not a production dependency.

## Required live acceptance test

Use two separate accounts on two devices, initially with headphones and different networks (Wi-Fi and mobile data). Join one room, allow mic permissions, unmute each in turn and confirm both directions. Test local mute, mic mute, leaving, rejoining, navigating lobby → auction → summary, switching to another room, denied permission, and turning a network off. With relay configured, verify a `relay` candidate is available using browser WebRTC diagnostics; merely receiving credentials does not prove relay connectivity.

Voice uses a small-room audio mesh (up to ten accounts), not a large broadcast system. Only the latest observed session per remote account is connected. Background tabs/phone screen locks may suspend browser audio or networking; reopen the game and rejoin if needed. For large rooms or strict background operation, use an SFU/native client in a separate upgrade.

## Security and privacy boundaries

No audio is recorded or uploaded to Firebase. Peers exchange audio using WebRTC; connection metadata, presence and mute state are stored temporarily. Leave and Firebase onDisconnect remove session data; peer liveness also expires after 45 seconds without heartbeat. WebRTC direct connections disclose network addresses to peers as part of normal ICE negotiation.

New voice data lives under `voiceRooms`, outside the existing broadly writable auction room path. Rules bind writes to the authenticated sender UID; room members can read room voice metadata. The existing game lets authenticated clients write team and room membership, so these rules inherit that trust model and are **not hardened against malicious players forging game membership**. No existing game permissions were widened. Strengthening game membership server-side is a separate update.

## Source references

- https://webrtc.org/getting-started/turn-server
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://firebase.google.com/docs/database/security/rules-conditions
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf
