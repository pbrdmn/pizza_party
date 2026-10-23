import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, GameError } from './room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function randomCode(rooms) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-6);
}

function token() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function createPizzaServer({ port = 3000, fast = false } = {}) {
  const rooms = new Map();
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

  function send(ws, msg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  function attach(ws, room, player) {
    ws.playerId = player.id;
    ws.roomCode = room.code;
    player.send = (msg) => send(ws, msg);
    player.connected = true;
    send(ws, {
      t: 'welcome',
      playerId: player.id,
      token: player.token,
      code: room.code,
    });
    room.broadcastState();
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { t: 'error', message: 'That message was not valid JSON.' });
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      try {
        handleMessage(ws, msg);
      } catch (err) {
        if (err instanceof GameError) {
          send(ws, { t: 'error', message: err.message });
        } else {
          console.error('[pizza]', err);
          send(ws, { t: 'error', message: 'Something went wrong in the kitchen.' });
        }
      }
    });

    ws.on('close', () => {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const player = room.players.get(ws.playerId);
      if (!player) return;
      player.send = null;
      room.setConnected(player.id, false);
      const disconnectedAt = Date.now();
      player.disconnectedAt = disconnectedAt;
      setTimeout(() => {
        const liveRoom = rooms.get(room.code);
        if (!liveRoom) return;
        const p = liveRoom.players.get(player.id);
        if (p && !p.connected && p.disconnectedAt === disconnectedAt) {
          liveRoom.removePlayer(player.id);
          liveRoom.broadcastState();
          if (![...liveRoom.players.values()].some((x) => x.connected)) {
            liveRoom.destroy();
            rooms.delete(liveRoom.code);
          }
        }
      }, 5 * 60 * 1000).unref?.();
    });
  });

  function handleMessage(ws, msg) {
    if (msg.t === 'create') {
      const code = randomCode(rooms);
      const room = new Room(code, { fast });
      const player = room.addPlayer(msg.name, { spectator: !!msg.spectator });
      player.token = token();
      rooms.set(code, room);
      attach(ws, room, player);
      return;
    }
    if (msg.t === 'join') {
      const code = String(msg.code ?? '').replace(/\D/g, '').slice(0, 6);
      const room = rooms.get(code);
      if (!room) throw new GameError('No kitchen with that code. Double-check the six digits.');
      if (room.players.size >= 60) throw new GameError('That kitchen is packed! Try another code.');
      const player = room.addPlayer(msg.name, { spectator: !!msg.spectator });
      player.token = token();
      attach(ws, room, player);
      return;
    }
    if (msg.t === 'resume') {
      const code = String(msg.code ?? '').replace(/\D/g, '').slice(0, 6);
      const room = rooms.get(code);
      if (!room) throw new GameError('That kitchen has closed.');
      const player = [...room.players.values()].find((p) => p.token && p.token === msg.token);
      if (!player) throw new GameError('That seat is no longer available.');
      player.disconnectedAt = null;
      attach(ws, room, player);
      return;
    }

    const room = rooms.get(ws.roomCode);
    if (!room) throw new GameError('You are not in a kitchen.');
    const player = room.players.get(ws.playerId);
    if (!player) throw new GameError('You are not in this kitchen.');
    const pid = player.id;
    switch (msg.t) {
      case 'setRole':
        room.setRole(pid, !!msg.spectator);
        break;
      case 'settings':
        room.updateSettings(pid, msg.settings || {});
        break;
      case 'start':
        room.start(pid);
        break;
      case 'roll':
        room.doRoll(pid, msg);
        break;
      case 'push':
        room.doPush(pid, msg);
        break;
      case 'undo':
        room.doUndo(pid);
        break;
      case 'resetPizza':
        room.resetPizza(pid);
        break;
      case 'bakeNow':
        room.bakeNow(pid);
        break;
      case 'endGame':
        room.endGame(pid, 'host');
        break;
      case 'playAgain':
        room.playAgain(pid);
        break;
      case 'chat':
        room.chatMessage(pid, msg.text);
        break;
      case 'tap':
        room.tap(pid);
        break;
      case 'leave': {
        room.removePlayer(pid);
        room.broadcastState();
        ws.roomCode = null;
        ws.playerId = null;
        if (!room.players.size) {
          room.destroy();
          rooms.delete(room.code);
        }
        break;
      }
      case 'ping':
        send(ws, { t: 'pong', at: Date.now() });
        break;
      default:
        throw new GameError('Unknown command.');
    }
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 30_000);
  heartbeat.unref?.();

  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => resolve(server.address()));
    });
  }

  function close() {
    clearInterval(heartbeat);
    for (const room of rooms.values()) room.destroy();
    rooms.clear();
    return new Promise((resolve) => {
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => server.close(() => resolve()));
    });
  }

  return { server, wss, rooms, listen, close };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const app = createPizzaServer({ port });
  app.listen().then((addr) => {
    console.log(`🍕 Pizza Party is ready at http://localhost:${addr.port}`);
  });
}
