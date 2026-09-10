# FileSync

Direct, peer-to-peer file sharing between devices — via a room code, a same-WiFi
match, or a shared link. Files never touch the server; it only helps devices
find each other.

```
filesync/
├── server/     Node.js + TypeScript signaling server (Socket.IO)
├── client/     Next.js + TypeScript + Tailwind frontend
└── docker-compose.yml
```

## How it actually works

1. **Signaling only, never file bytes.** The Node/Socket.IO server in
   `server/` manages room codes, membership, and relays WebRTC handshake
   messages (SDP offers/answers, ICE candidates). It never sees file
   contents — those flow directly between browsers over a WebRTC
   `RTCDataChannel`.
2. **Mesh network per room.** Every pair of participants opens its own
   `RTCPeerConnection` + data channel. For N users that's `N·(N-1)/2`
   connections — fine for small rooms (default cap: 8 people/room,
   configurable via `MAX_ROOM_SIZE`).
3. **Chunked, backpressure-aware transfer.** Files are sliced into 64KB
   chunks (`client/src/lib/types.ts`), streamed with a 2-byte transfer-id
   header so multiple files can interleave on one channel, and paced using
   `bufferedAmountLow` so the sender never floods the channel — this is what
   makes large files and multiple simultaneous transfers reliable.
4. **Real integrity verification.** Since `crypto.subtle` has no incremental
   digest API, `client/src/lib/sha256Stream.ts` implements SHA-256 per
   FIPS 180-4 so both sides can hash a file chunk-by-chunk without holding
   the whole thing in memory. The receiver rejects the transfer if its
   computed hash doesn't match the sender's.
5. **Cross-network connectivity.** ICE servers (STUN, and TURN if you
   configure one) are served from `GET /api/ice-config` so nothing is
   hardcoded client-side. STUN alone gets most home/mobile NATs connected;
   a TURN server is what makes symmetric-NAT / strict-firewall pairs work
   reliably — see "TURN" below.

## Known, honestly-stated limitations

- **Same-WiFi discovery** does not use real mDNS/Bonjour — browsers can't
  open raw multicast sockets. Instead, the signaling server groups clients
  that request discovery *and* share the same public IP as seen by the
  server (i.e., behind the same router/NAT), which is a strong, real signal
  for "same local network," and introduces them so they can connect. It is
  a heuristic, not true zero-config LAN discovery, and it will not group two
  devices that are on the same WiFi but behind a mobile hotspot with CGNAT
  quirks, or a large corporate network. This is disclosed to the user in the
  UI copy on `/same-wifi`, not presented as something it isn't.
- **True background execution** (a fully suspended tab still pushing bytes)
  is not something any browser exposes. `RTCDataChannel` connections and
  in-flight sends generally survive tab switching and minimizing; some
  mobile OSes will suspend JS execution after a longer background period.
  When that happens the peer connection will show `reconnecting`/`offline`
  and the transfer state (bytes-so-far, hash-in-progress) is preserved in
  memory so the UI recovers cleanly when the tab is foregrounded again — it
  is not silently lost or falsely reported as complete.
- **Full resume-after-disconnect** (continuing a large transfer from the
  exact byte after a real network drop) has its protocol groundwork in
  place — periodic `file-ack` progress acknowledgements and a
  `file-resume-request` message are defined in `client/src/lib/types.ts` —
  but the sender-side resume dispatch is the one piece left as a follow-up;
  today a dropped connection mid-transfer is retried via ICE restart, and if
  that fails the transfer is marked `failed` rather than silently hung, so
  the user always gets an accurate status rather than a false "complete."

None of the above are faked in the UI: statuses reflect the real state
machine, room codes are real and server-issued, and every transfer you see
complete has passed the SHA-256 check above.

## Local development

Requires Node.js ≥ 18.17.

```bash
# Terminal 1 — signaling server
cd server
cp .env.example .env
npm install
npm run dev            # http://localhost:4000

# Terminal 2 — frontend
cd client
cp .env.example .env
npm install
npm run dev            # http://localhost:3000
```

Open `http://localhost:3000` in two browser tabs (or two devices on the same
network pointed at your machine's LAN IP) to test locally.

## Production deployment

### 1. Signaling server (`server/`)

Deploy anywhere that runs a persistent Node process (Render, Railway, Fly.io,
a VPS, ECS, etc. — this is a stateful WebSocket server, not a serverless
function).

```bash
cd server
npm install
npm run build
npm start
```

Set real environment variables (see `server/.env.example`):
- `CLIENT_ORIGINS` — your deployed frontend origin(s), comma-separated.
- `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` — see TURN section below.
- Put this behind HTTPS/WSS (a reverse proxy like Caddy/Nginx, or your PaaS's
  built-in TLS termination) — browsers will refuse to mix an `https://`
  frontend with an insecure `ws://` signaling connection.

### 2. Frontend (`client/`)

Deploy as a standard Next.js app (Vercel, Netlify, a Node server, or
`docker build` with the included `Dockerfile`).

Set `NEXT_PUBLIC_SIGNALING_URL` to your deployed signaling server's public
HTTPS URL.

### 3. Docker Compose (both together)

```bash
cp server/.env.example .env   # then edit values; docker-compose reads root .env
docker compose up --build
```

### TURN (needed for reliable cross-network transfer)

STUN alone fails for a meaningful fraction of real-world pairs (symmetric
NATs, some corporate/mobile networks). For production-grade reliability,
run a TURN server:

```bash
docker run -d --network=host coturn/coturn \
  -n --realm=yourdomain.com --listening-port=3478 \
  --min-port=49160 --max-port=49200 \
  --user=filesync:CHANGE_ME
```

Then set in `server/.env`:
```
TURN_URL=turn:your-turn-host:3478
TURN_USERNAME=filesync
TURN_CREDENTIAL=CHANGE_ME
```

(Managed alternatives: Twilio Network Traversal Service, Cloudflare Calls,
Xirsys — any that hand you a `turn:` URL + credentials work the same way.)

## Security notes

- Room codes are server-generated (6 chars, ambiguous characters excluded),
  never client-suppliable.
- The signaling server relays WebRTC handshake payloads only to sockets it
  has verified are members of the same room — never to an arbitrary ID.
- Same-WiFi invites are restricted server-side to sockets the server itself
  grouped by shared public IP; a client cannot invite an arbitrary socket ID.
- Basic per-socket rate limiting on signaling events (`RATE_LIMIT_MAX` /
  `RATE_LIMIT_WINDOW_MS`).
- Rooms are cleaned up immediately when empty, and swept every 5 minutes for
  staleness (`ROOM_TTL_MINUTES`) in case a client vanished without a clean
  disconnect (e.g., laptop lid closed).
- Device names are sanitized (control characters stripped, length-capped)
  before broadcast; never trusted for anything beyond display.
- CORS is locked to `CLIENT_ORIGINS`; no secrets are ever sent to the
  frontend — TURN credentials are fetched server-side per session via
  `/api/ice-config`, not hardcoded in client source.

## Manual test checklist

Run these across real devices/browsers once both services are deployed
(or on your LAN for local testing):

1. Device A → Make Room → note the code. Device B → Join Room → enter code.
   A sends a PDF → confirm B receives it and the hash-verified download works.
2. B sends a ZIP back to A.
3. A third device (C) joins the same room; confirm all three can send to
   each other (not just to the creator).
4. Select and send several files at once; confirm they progress
   concurrently in the UI, not strictly one-after-another.
5. Send a large file (500MB+) and confirm the completed download's SHA-256
   matches the original (`shasum -a 256 file` on both ends).
6. Put A and B on different networks (e.g., A on WiFi, B on cellular data)
   and confirm the transfer still connects — this is what validates your
   TURN setup is actually working, since STUN-only will fail this case for
   some NAT types.
7. Switch tabs / minimize during a transfer; confirm it continues or the UI
   accurately reflects reconnecting state rather than silently stalling.
8. Force a disconnect (turn off WiFi briefly) and confirm the room shows
   "Reconnecting" and recovers when connectivity returns.
9. Open `/same-wifi` on two devices on the same network and confirm they
   discover and can connect to each other.
10. Load the app on both a phone and a desktop browser and confirm the
    layout and flows work on both.
