# 🍕 Pizza Party

A cooperative, real-time pizza-making puzzle for the browser. Everyone gets a
six-digit kitchen code, piles into a lobby, rolls out the dough, sauces it, and
pushes toppings in from the edges to match the recipe. When the pizza is ready,
the whole kitchen taps the oven together to cook it to a golden crust.

No accounts, no installs, no pineapple judgment.

## What's in the game

- **Six-digit kitchens** — host a game to get a code, or join with a friend's
  code. Share a link with `/?code=123456` to pre-fill the code for them.
- **Any number of chefs** — everyone takes turns (kitchens accept up to 60
  connections). Late arrivals watch from the pass and can join the next game.
- **Spectator mode** — join with "I'm just here to watch", or share
  `/?code=123456&watch=1` to pre-fill the code and tick the spectator box.
- **Collapsible chat** — unread messages show as a badge, so the board stays
  clear.
- **Three game modes**
  - **Pizza Party** — cook a set number of pizzas together.
  - **Rush Hour** — bake as many as you can before the clock runs out.
  - **Chef's Special** — no recipe. Build something beautiful and ring the oven
    bell when you're happy.
- **A real opening act** — each pizza starts as a ball of dough. Chefs take
  turns rolling it out from the edges, then the sauce goes on, then the toppings
  begin.
- **Push-based puzzles** — pick an ingredient card, then push it into a row or
  column from any edge. Toppings shift along the lane, and the far edge topping
  falls off.
- **Guaranteed-solvable recipes** — generated targets always have a solution
  from an all-cheese base, and the par score is the length of that solution.
- **Oven mini-game** — tap together to hold the heat in the golden band. Too
  slow is raw dough; too fast is charcoal.
- **Team scoring** — speed, push efficiency, cooking quality, and reset
  penalties feed a shared score. Undo and "scrap pizza" are available when
  things go sideways.
- **3D table** — a Three.js kitchen with a wood peel, brick oven, rolling pin,
  flour jar, basil pot, and toppings that pop into place.

## How to play

1. Enter a chef name and **Host a game**, or enter a six-digit code and **Join**.
2. In the lobby, the host picks a mode, pizza size (4×4–9×9), and the number of
   pizzas or the Rush Hour time limit.
3. The host starts the kitchen. On your turn:
   - **Dough phase:** choose an edge and roll the dough toward it. Keep going
     until the whole grid is covered.
   - **Sauce phase:** automatic — the sauce spreads over the dough.
   - **Toppings phase:** pick one of your four ingredient cards, then push it
     into a lane from any edge. Match the recipe shown in the top-left panel.
4. When the recipe matches (or the host calls the oven in Chef's Special), the
   pizza slides into the oven. Everyone taps/presses Space to keep the heat in
   the green band.
5. Eat. Repeat.

Turns time out after 75 seconds. If a chef is away, the kitchen automatically
rolls the dough or pushes a random topping so the game never stalls.

## Requirements

- Node.js 20+ (Node 22 LTS recommended)
- npm

The browser client uses native ES modules and a vendored copy of Three.js, so
there is no front-end bundler or build step for development.

## Run in dev mode

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. `npm run dev` starts the server with Node's
`--watch` flag, so server changes restart automatically. Static client changes
only need a browser refresh.

To use a different port:

```bash
PORT=4000 npm run dev
```

## Build for production

```bash
npm run build
```

This creates a self-contained `dist/` directory containing:

- `dist/public/` — HTML, CSS, fonts, vendored Three.js, and client modules
- `dist/server/` — the WebSocket/static server
- `dist/package.json` and `dist/package-lock.json`

Run the production bundle:

```bash
cd dist
npm ci --omit=dev
npm start
```

Or, if dependencies are already installed in the project root:

```bash
npm run start:prod
```

The production server serves the static client and the `/ws` WebSocket endpoint
from the same origin. `GET /health` returns `{"ok":true}` for load balancers.

## Publish / deploy

The app is a single Node process with in-memory rooms. It needs a host that
supports WebSocket upgrades, and it should run as **one instance** unless you add
shared room state.

### Docker (recommended)

Build and run locally:

```bash
docker build -t pizza-party .
docker run --rm -p 3000:3000 pizza-party
```

Publish the image to a registry:

```bash
docker tag pizza-party ghcr.io/<your-user>/pizza-party:latest
docker push ghcr.io/<your-user>/pizza-party:latest
```

Then deploy the image to a container host such as Fly.io, Render, Railway, or a
VPS. Set `PORT` if the platform requires it (defaults to `3000`) and point the
health check at `/health`. No database, object storage, or other services are
required.

### Plain Node host

On any machine with Node 20+:

```bash
npm run build
cd dist
npm ci --omit=dev
npm start
```

Put a TLS-terminating reverse proxy (Caddy, nginx, etc.) in front of it and make
sure WebSocket upgrades for `/ws` are passed through. The client automatically
uses `wss://` when the page is served over HTTPS.

## Tests

```bash
npm test
```

The suite uses Node's built-in test runner and covers:

- recipe generation and guaranteed solutions
- dough rolling and stage transitions
- push mechanics, undo, and win detection
- the oven mini-game and scoring
- lobby, chat, spectators, reconnect/resume, and full co-op rounds over real
  WebSockets

## Project layout

```
public/            Browser client
  index.html       Landing, lobby, game, overlays
  css/styles.css   Visual design
  js/main.js       Networking, state rendering, UI bindings
  js/scene.js      Three.js kitchen and pizza rendering
  vendor/          Three.js and OrbitControls
server/
  index.js         HTTP static server + WebSocket server
  room.js          Lobby, turn order, phases, chat, timers
  engine.js        Pure game rules, recipes, dough, oven, scoring
scripts/build.js   Production bundle builder
tests/             Engine and WebSocket integration tests
pizza_party.md     Original design brief
```

## Design notes and current limits

- Rooms live in memory. An empty room is cleaned up after its players leave;
  restarting the server clears every room. A kitchen accepts up to 60
  connections.
- The current turn can push from any edge. The original brief describes a
  rotating pizza with a fixed "front edge" per player; a rotation-based variant
  is a possible future mode.
- Pizza sizes are 4×4 through 9×9. The brief's round 5×5, 7×7, and 9×9
  examples use empty corners; the current board is a full square grid instead.
- Recipe matching is exact. Rotation-invariant matching is not enabled because
  the board does not rotate during play.
- There is no account system or persistent scoreboard by design.
