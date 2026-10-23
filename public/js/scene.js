import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

const INGREDIENT_COLORS = {
  cheese: 0xf4c84a,
  pepperoni: 0xc93b2b,
  tomato: 0xe94f37,
  basil: 0x4fae4a,
  olive: 0x4c5b2f,
  mushroom: 0xe8d6b3,
  pineapple: 0xf2c744,
  onion: 0xb79bdc,
};

const INGREDIENT_ICONS = {
  cheese: '🧀',
  pepperoni: '🍖',
  tomato: '🍅',
  basil: '🥬',
  olive: '🫒',
  mushroom: '🍄',
  pineapple: '🍍',
  onion: '🧅',
};

function roundedShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWoodTexture() {
  return canvasTexture(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#5b3520');
    g.addColorStop(0.5, '#4a2a18');
    g.addColorStop(1, '#3a2011');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let plank = 0; plank < 6; plank++) {
      const y = (plank / 6) * s;
      ctx.fillStyle = plank % 2 ? 'rgba(255,190,120,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, y, s, s / 6);
      ctx.strokeStyle = 'rgba(20,8,3,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = `rgba(${30 + Math.random() * 30},${14 + Math.random() * 15},${5},${0.08 + Math.random() * 0.1})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        const yy = y + 8 + Math.random() * (s / 6 - 16);
        ctx.moveTo(0, yy);
        for (let x = 0; x <= s; x += 32) {
          ctx.lineTo(x, yy + Math.sin(x * 0.02 + plank) * 3 + Math.random() * 2);
        }
        ctx.stroke();
      }
    }
  });
}

function makeCheeseTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#f4ca62';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 4 + Math.random() * 22;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const colors = ['#ffdf8e', '#e8b442', '#f9d879', '#dca83b', '#ffe6a1'];
      grad.addColorStop(0, colors[Math.floor(Math.random() * colors.length)] + 'aa');
      grad.addColorStop(1, 'rgba(244,202,98,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = 'rgba(180,120,30,0.28)';
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makePepperoniTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#b93326';
    ctx.fillRect(0, 0, s, s);
    const grad = ctx.createRadialGradient(s * 0.4, s * 0.35, 4, s / 2, s / 2, s * 0.7);
    grad.addColorStop(0, '#d6533c');
    grad.addColorStop(1, '#8f2419');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(80,16,10,${0.35 + Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makeBrickTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(0, 0, s, s);
    const rows = 6;
    const bw = s / 4;
    const bh = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 5; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        const y = r * bh;
        const shade = 55 + Math.random() * 35;
        ctx.fillStyle = `rgb(${shade + 45},${shade},${shade - 15})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = 'rgba(255,210,150,0.04)';
        ctx.fillRect(x + 2, y + 2, bw - 4, 3);
      }
    }
  });
}

function emojiTexture(icon) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '94px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PizzaScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.size = 4;
    this.board = null;
    this.target = null;
    this.pizzaGroup = null;
    this.cellGroups = [];
    this.accentMeshes = [];
    this.ghostSprites = [];
    this.effects = [];
    this.confetti = [];
    this.lastMoveAt = 0;
    this.hints = true;
    this.phase = 'making';
    this.stage = 'toppings';
    this.dough = null;
    this.ovenOn = false;
    this.cameraGoal = null;
    this.cameraLook = new THREE.Vector3(0, 0, 0);
    this.clock = new THREE.Clock();
    this.emojiCache = new Map();
    this._init();
  }

  _init() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x150c07, 0.038);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 10.9, 7.9);
    this.camera = camera;

    const controls = new OrbitControls(camera, this.canvas);
    controls.target.set(0, -0.5, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 7;
    controls.maxDistance = 17;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.38;
    controls.autoRotate = false;
    controls.update();
    controls.addEventListener('change', () => this.onCameraChange?.());
    this.controls = controls;

    this._lights();
    this._table();
    this._oven();
    this._props();
    this._particles();
    this._buildPizza(4);
    this.resize();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._animate = this._animate.bind(this);
    this._raf = requestAnimationFrame(this._animate);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xffe6bd, 0x2a1408, 0.75);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffd6a0, 2.1);
    key.position.set(5.5, 11, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 25;
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xff9d55, 0.55);
    fill.position.set(-7, 4, -4);
    this.scene.add(fill);

    const spot = new THREE.SpotLight(0xffd8a0, 22, 18, Math.PI / 5, 0.45, 1.2);
    spot.position.set(0, 8.5, 2);
    spot.target.position.set(0, 0, 0);
    this.scene.add(spot, spot.target);

    const ovenLight = new THREE.PointLight(0xff6a22, 0, 8, 2);
    ovenLight.position.set(3.4, 0.4, -2.8);
    this.ovenLight = ovenLight;
    this.scene.add(ovenLight);
  }

  _table() {
    const wood = makeWoodTexture();
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.92, metalness: 0.02 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -1.25;
    table.receiveShadow = true;
    this.scene.add(table);

    const mat = new THREE.MeshStandardMaterial({ color: 0x23130b, roughness: 0.85 });
    const placemat = new THREE.Mesh(new THREE.CircleGeometry(6.1, 64), mat);
    placemat.rotation.x = -Math.PI / 2;
    placemat.position.y = -1.19;
    placemat.receiveShadow = true;
    this.scene.add(placemat);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(6.1, 0.055, 8, 80),
      new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.7, metalness: 0.15 }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -1.16;
    this.scene.add(rim);
  }

  _oven() {
    const group = new THREE.Group();
    group.position.set(3.65, -0.75, -3.35);
    group.rotation.y = -0.38;
    const brick = makeBrickTexture();
    const brickMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.7, 2.7), brickMat);
    body.position.y = 1.15;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.5, 16), brickMat);
    chimney.position.set(0.8, 3.1, -0.5);
    chimney.castShadow = true;
    group.add(chimney);

    const mouth = new THREE.Mesh(
      new THREE.CircleGeometry(0.98, 40),
      new THREE.MeshStandardMaterial({ color: 0x120603, roughness: 1 }),
    );
    mouth.position.set(0, 0.9, 1.36);
    group.add(mouth);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 32),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.6 }),
    );
    glow.position.set(0, 0.75, 1.37);
    this.ovenGlow = glow;
    group.add(glow);

    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.16, 10, 28, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8c4c26, roughness: 0.8 }),
    );
    arch.position.set(0, 0.9, 1.4);
    group.add(arch);

    const hearth = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 0.28, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x6b3a1c, roughness: 0.85 }),
    );
    hearth.position.set(0, -0.18, 1.55);
    hearth.castShadow = true;
    group.add(hearth);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.3, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x2a170d, roughness: 0.8 }),
    );
    sign.position.set(0, 2.3, 1.38);
    group.add(sign);
    this.scene.add(group);
    this.oven = group;
  }

  _props() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a6133, roughness: 0.7 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5b3520, roughness: 0.8 });

    // Rolling pin
    const pin = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 20), woodMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.castShadow = true;
    pin.add(barrel);
    for (const x of [-1.5, 1.5]) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.55, 12), darkWoodMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.x = x;
      handle.castShadow = true;
      pin.add(handle);
    }
    pin.position.set(-4.4, -0.95, 1.9);
    pin.rotation.y = 0.5;
    this.scene.add(pin);

    // Flour jar
    const jar = new THREE.Group();
    const jarBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.38, 0.85, 20),
      new THREE.MeshStandardMaterial({ color: 0xe9dcc4, roughness: 0.4, metalness: 0.05 }),
    );
    jarBody.position.y = 0.42;
    jarBody.castShadow = true;
    jar.add(jarBody);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.12, 20),
      new THREE.MeshStandardMaterial({ color: 0xb98540, roughness: 0.6 }),
    );
    lid.position.y = 0.9;
    jar.add(lid);
    jar.position.set(-4.7, -1.2, -1.6);
    this.scene.add(jar);

    // Basil pot
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.28, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: 0xc16a3a, roughness: 0.8 }),
    );
    pot.position.set(4.8, -0.95, 1.5);
    pot.castShadow = true;
    this.scene.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4fae4a, roughness: 0.7 });
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leafMat);
      leaf.scale.set(1, 0.25, 0.55);
      leaf.position.set(4.8 + Math.cos(i * 1.7) * 0.25, -0.58 + (i % 3) * 0.12, 1.5 + Math.sin(i * 1.7) * 0.25);
      leaf.rotation.set(Math.random() * 0.5, i, 0.5);
      leaf.castShadow = true;
      this.scene.add(leaf);
    }
  }

  _particles() {
    const count = 120;
    const positions = new Float32Array(count * 3);
    this.particleSeeds = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = Math.random() * 7 - 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      this.particleSeeds.push({ y: positions[i * 3 + 1], speed: 0.05 + Math.random() * 0.08, phase: Math.random() * 10 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe6bd,
      size: 0.035,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  _disposeGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map && !m.userData.sharedMap) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.scene.remove(group);
  }

  _buildPizza(size) {
    if (this.pizzaGroup) {
      this._disposeGroup(this.pizzaGroup);
      this.emojiCache.clear();
      this._pepTex = null;
    }
    this.size = size;
    this.cellSize = 5.1 / size;
    this.cellGroups = [];
    this.accentMeshes = [];
    this.ghostSprites = [];
    this.pizzaGroup = new THREE.Group();
    this.scene.add(this.pizzaGroup);

    const board = 5.1;
    const wood = makeWoodTexture();
    const peelMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82 });
    const peel = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedShape(board + 1.35, board + 1.35, 0.55), {
        depth: 0.2,
        bevelEnabled: true,
        bevelSize: 0.05,
        bevelThickness: 0.05,
        bevelSegments: 2,
      }),
      peelMat,
    );
    peel.rotation.x = -Math.PI / 2;
    peel.position.y = -0.46;
    peel.receiveShadow = true;
    peel.castShadow = true;
    this.pizzaGroup.add(peel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 2.4), peelMat);
    handle.position.set(0, -0.4, (board + 1.35) / 2 + 1.15);
    handle.castShadow = true;
    handle.receiveShadow = true;
    this.pizzaGroup.add(handle);

    const crustMat = new THREE.MeshStandardMaterial({ color: 0xd09046, roughness: 0.9 });
    const base = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedShape(board + 0.45, board + 0.45, 0.4), {
        depth: 0.26,
        bevelEnabled: true,
        bevelSize: 0.06,
        bevelThickness: 0.06,
        bevelSegments: 3,
      }),
      crustMat,
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.26;
    base.receiveShadow = true;
    base.castShadow = true;
    this.pizzaGroup.add(base);

    const sauce = new THREE.Mesh(
      new THREE.PlaneGeometry(board + 0.18, board + 0.18),
      new THREE.MeshStandardMaterial({ color: 0x9e2f1b, roughness: 0.9 }),
    );
    sauce.rotation.x = -Math.PI / 2;
    sauce.position.y = 0.015;
    sauce.receiveShadow = true;
    this.pizzaGroup.add(sauce);
    this.sauceMesh = sauce;

    const cheeseTex = makeCheeseTexture();
    this.cheeseMat = new THREE.MeshStandardMaterial({ map: cheeseTex, roughness: 0.72, metalness: 0.01 });
    this.doughMat = new THREE.MeshStandardMaterial({ color: 0xf1d9a6, roughness: 0.96, metalness: 0.0 });

    // Crust frame (four raised edges + rounded corners)
    const crustFrameMat = new THREE.MeshStandardMaterial({ color: 0xd99a4b, roughness: 0.88 });
    const edgeT = 0.42;
    const topEdge = new THREE.Mesh(new THREE.BoxGeometry(board + 0.55, 0.22, edgeT), crustFrameMat);
    topEdge.position.set(0, 0.11, -(board + 0.1) / 2);
    const bottomEdge = topEdge.clone();
    bottomEdge.position.z = (board + 0.1) / 2;
    const leftEdge = new THREE.Mesh(new THREE.BoxGeometry(edgeT, 0.22, board + 0.1), crustFrameMat);
    leftEdge.position.set(-(board + 0.1) / 2, 0.11, 0);
    const rightEdge = leftEdge.clone();
    rightEdge.position.x = (board + 0.1) / 2;
    for (const edge of [topEdge, bottomEdge, leftEdge, rightEdge]) {
      edge.castShadow = true;
      edge.receiveShadow = true;
      this.pizzaGroup.add(edge);
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const corner = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), crustFrameMat);
      corner.position.set(x * (board + 0.1) / 2, 0.11, z * (board + 0.1) / 2);
      corner.castShadow = true;
      this.pizzaGroup.add(corner);
    }

    // Cell tiles
    const tileGeo = new THREE.BoxGeometry(this.cellSize * 0.93, 0.055, this.cellSize * 0.93);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x = (c - (size - 1) / 2) * this.cellSize;
        const z = (r - (size - 1) / 2) * this.cellSize;
        const tile = new THREE.Mesh(tileGeo, this.cheeseMat);
        tile.position.set(x, 0.045, z);
        tile.receiveShadow = true;
        tile.castShadow = false;
        this.pizzaGroup.add(tile);
        const cellGroup = new THREE.Group();
        cellGroup.position.set(x, 0.09, z);
        this.pizzaGroup.add(cellGroup);
        this.cellGroups.push({ group: cellGroup, tile, x, z, accent: null, type: 'cheese' });
      }
    }

    this.ghostGroup = new THREE.Group();
    this.pizzaGroup.add(this.ghostGroup);
    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.085;
    this.highlight.visible = false;
    this.pizzaGroup.add(this.highlight);

    this.highlightArrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.42, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.highlightArrow.visible = false;
    this.pizzaGroup.add(this.highlightArrow);

    this.board = null;
    this.target = null;
    if (this._pendingBoard) {
      const { boardData, targetData, lastMove } = this._pendingBoard;
      this._pendingBoard = null;
      this.updateBoard(boardData, targetData, lastMove, true);
    }
  }

  _accentMesh(type) {
    const cell = this.cellSize;
    const group = new THREE.Group();
    const color = INGREDIENT_COLORS[type] ?? 0xffffff;
    if (type === 'pepperoni') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 });
      const top = new THREE.MeshStandardMaterial({ map: this._pepperoniTexture(), roughness: 0.6 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(cell * 0.34, cell * 0.34, 0.075, 22), [mat, top, mat]);
      mesh.position.y = 0.04;
      group.add(mesh);
    } else if (type === 'tomato') {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(cell * 0.27, 18, 14),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
      );
      body.scale.y = 0.7;
      body.position.y = 0.02;
      group.add(body);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.7 });
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(cell * 0.055, cell * 0.2, 5), leafMat);
        leaf.position.set(Math.cos(i * 1.256) * cell * 0.08, 0.14, Math.sin(i * 1.256) * cell * 0.08);
        leaf.rotation.set(Math.PI / 2, 0, i * 1.256);
        group.add(leaf);
      }
    } else if (type === 'basil') {
      const leafMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, side: THREE.DoubleSide });
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(cell * 0.22, 10, 8), leafMat);
        leaf.scale.set(1, 0.12, 0.55);
        leaf.position.set(Math.cos(i * 2.1) * cell * 0.12, 0.03 + i * 0.01, Math.sin(i * 2.1) * cell * 0.12);
        leaf.rotation.y = i * 2.1;
        group.add(leaf);
      }
    } else if (type === 'olive') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(cell * 0.2, cell * 0.07, 8, 18),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.04;
      group.add(ring);
      const pimento = new THREE.Mesh(
        new THREE.SphereGeometry(cell * 0.055, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }),
      );
      pimento.position.y = 0.04;
      group.add(pimento);
    } else if (type === 'mushroom') {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(cell * 0.09, cell * 0.12, cell * 0.2, 10),
        new THREE.MeshStandardMaterial({ color: 0xf1e4cb, roughness: 0.7 }),
      );
      stem.position.y = 0.1;
      group.add(stem);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(cell * 0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xcaa87a, roughness: 0.65 }),
      );
      cap.scale.y = 0.6;
      cap.position.y = 0.2;
      group.add(cap);
    } else if (type === 'pineapple') {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      for (let i = 0; i < 3; i++) {
        const chunk = new THREE.Mesh(new THREE.ConeGeometry(cell * 0.14, cell * 0.24, 4), mat);
        chunk.position.set((i - 1) * cell * 0.17, 0.1, (i % 2) * cell * 0.1);
        chunk.rotation.y = i * 0.7;
        group.add(chunk);
      }
    } else if (type === 'onion') {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(cell * (0.18 + i * 0.09), cell * 0.035, 6, 18), mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.035 + i * 0.012;
        group.add(ring);
      }
    } else {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(cell * 0.2, 10, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
      );
      mesh.position.y = 0.08;
      group.add(mesh);
    }
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return group;
  }

  _pepperoniTexture() {
    if (!this._pepTex) this._pepTex = makePepperoniTexture();
    return this._pepTex;
  }

  _setAccent(index, type) {
    const cell = this.cellGroups[index];
    if (!cell) return;
    if (cell.accent) {
      cell.group.remove(cell.accent);
      cell.accent.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map && m !== this._pepTex) m.map.dispose();
            m.dispose();
          }
        }
      });
      cell.accent = null;
    }
    cell.type = type;
    if (type === 'cheese') return;
    const mesh = this._accentMesh(type);
    mesh.rotation.y = (index * 2.399) % (Math.PI * 2);
    mesh.scale.setScalar(0.01);
    mesh.userData.pop = 0;
    cell.group.add(mesh);
    cell.accent = mesh;
    this.accentMeshes.push(mesh);
  }

  _setGhosts(target) {
    for (const sprite of this.ghostSprites) {
      this.ghostGroup.remove(sprite);
      sprite.material.dispose();
    }
    this.ghostSprites = [];
    if (!target) return;
    for (let i = 0; i < target.length; i++) {
      const type = target[i];
      if (type === 'cheese') continue;
      const icon = INGREDIENT_ICONS[type] || '•';
      if (!this.emojiCache.has(icon)) this.emojiCache.set(icon, emojiTexture(icon));
      const mat = new THREE.SpriteMaterial({
        map: this.emojiCache.get(icon),
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const cell = this.cellGroups[i];
      sprite.position.set(cell.x, 0.7, cell.z);
      sprite.scale.setScalar(Math.min(0.55, this.cellSize * 0.7));
      sprite.userData.index = i;
      sprite.userData.baseY = 0.68;
      this.ghostGroup.add(sprite);
      this.ghostSprites.push(sprite);
    }
    this.ghostGroup.visible = this.hints;
    this._syncGhosts();
  }

  _syncGhosts() {
    if (!this.target || !this.board) return;
    for (const sprite of this.ghostSprites) {
      const i = sprite.userData.index;
      sprite.visible = this.hints && this.stage === 'toppings' && this.target[i] !== 'cheese' && this.board[i] !== this.target[i];
    }
  }

  updateBoard(board, target, lastMove = null, force = false) {
    if (!this.pizzaGroup) return;
    const sizeChanged = board && Math.sqrt(board.length) !== this.size;
    if (sizeChanged) {
      this._pendingBoard = { boardData: board, targetData: target, lastMove };
      this._buildPizza(Math.round(Math.sqrt(board.length)));
      return;
    }
    const targetChanged =
      !this.target ||
      !target ||
      target.length !== this.target.length ||
      target.some((v, i) => v !== this.target[i]);
    this.board = board ? [...board] : null;
    this.target = target ? [...target] : null;
    if (board) {
      for (let i = 0; i < board.length; i++) {
        const cell = this.cellGroups[i];
        if (!cell) continue;
        if (force || cell.type !== board[i]) this._setAccent(i, board[i]);
      }
    }
    if (targetChanged || force) this._setGhosts(this.target);
    else this._syncGhosts();
    if (lastMove && lastMove.at && lastMove.at !== this.lastMoveAt) {
      this.lastMoveAt = lastMove.at;
      this._playPush(lastMove);
    }
    if (this.stage === 'toppings' && this.target && this.board) {
      const won = this.target.every((t, i) => t === this.board[i]);
      if (won) this.celebrate();
    }
  }

  setStage(stage, dough = null) {
    if (!this.pizzaGroup) return;
    this.stage = stage || 'toppings';
    if (dough) this.dough = [...dough];
    const rolling = this.stage === 'dough';
    const saucing = this.stage === 'sauce';
    if (this.sauceMesh) this.sauceMesh.visible = !rolling;
    for (let i = 0; i < this.cellGroups.length; i++) {
      const cell = this.cellGroups[i];
      const covered = !rolling || (this.dough ? this.dough[i] !== false : true);
      cell.tile.visible = rolling ? covered : !saucing;
      cell.tile.material = rolling ? this.doughMat : this.cheeseMat;
      if (cell.accent) cell.accent.visible = this.stage === 'toppings';
    }
    if (this.ghostGroup) this.ghostGroup.visible = this.stage === 'toppings' && this.hints;
    if (this.stage !== 'toppings') this.clearHighlight();
    this._syncGhosts();
  }

  setHints(on) {
    this.hints = !!on;
    if (this.ghostGroup) this.ghostGroup.visible = this.hints && this.stage === 'toppings';
    this._syncGhosts();
  }

  highlightLane(side, lane) {
    if (!this.highlight) return;
    const cell = this.cellSize;
    const n = this.size;
    const pos = (lane - (n - 1) / 2) * cell;
    this.highlight.visible = true;
    this.highlightArrow.visible = true;
    if (side === 'T' || side === 'B') {
      this.highlight.scale.set(cell * 0.88, 5.1, 1);
      this.highlight.position.set(pos, 0.085, 0);
      this.highlightArrow.position.set(pos, 0.5, side === 'T' ? -3.05 : 3.05);
      this.highlightArrow.rotation.set(side === 'T' ? Math.PI / 2 : -Math.PI / 2, 0, 0);
    } else {
      this.highlight.scale.set(5.1, cell * 0.88, 1);
      this.highlight.position.set(0, 0.085, pos);
      this.highlightArrow.position.set(side === 'L' ? -3.05 : 3.05, 0.5, pos);
      this.highlightArrow.rotation.set(0, 0, side === 'L' ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  highlightEdge(side) {
    if (!this.highlight) return;
    const board = 5.1;
    this.highlight.visible = true;
    this.highlightArrow.visible = true;
    if (side === 'T' || side === 'B') {
      this.highlight.scale.set(board, 0.55, 1);
      this.highlight.position.set(0, 0.085, side === 'T' ? -board / 2 + 0.275 : board / 2 - 0.275);
      this.highlightArrow.position.set(0, 0.5, side === 'T' ? -3.05 : 3.05);
      this.highlightArrow.rotation.set(side === 'T' ? Math.PI / 2 : -Math.PI / 2, 0, 0);
    } else {
      this.highlight.scale.set(0.55, board, 1);
      this.highlight.position.set(side === 'L' ? -board / 2 + 0.275 : board / 2 - 0.275, 0.085, 0);
      this.highlightArrow.position.set(side === 'L' ? -3.05 : 3.05, 0.5, 0);
      this.highlightArrow.rotation.set(0, 0, side === 'L' ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  clearHighlight() {
    if (this.highlight) this.highlight.visible = false;
    if (this.highlightArrow) this.highlightArrow.visible = false;
  }

  _playPush(move) {
    const cell = this.cellSize;
    const n = this.size;
    const pos = (move.lane - (n - 1) / 2) * cell;
    let origin = new THREE.Vector3(0, 0, 0);
    let dir = new THREE.Vector3();
    if (move.side === 'T') { origin.set(pos, 0.5, -3.05); dir.set(0, 0, 1); }
    else if (move.side === 'B') { origin.set(pos, 0.5, 3.05); dir.set(0, 0, -1); }
    else if (move.side === 'L') { origin.set(-3.05, 0.5, pos); dir.set(1, 0, 0); }
    else { origin.set(3.05, 0.5, pos); dir.set(-1, 0, 0); }
    const color = INGREDIENT_COLORS[move.ingredient] ?? 0xffd166;
    const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.04, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      const spread = (Math.random() - 0.5) * 0.9;
      mesh.position.copy(origin);
      mesh.position.x += dir.z * spread;
      mesh.position.z += dir.x * spread;
      mesh.position.y += Math.random() * 0.25;
      const speed = 2.4 + Math.random() * 2.4;
      this.effects.push({
        mesh,
        vx: dir.x * speed + (Math.random() - 0.5) * 0.4,
        vy: 0.6 + Math.random() * 1.4,
        vz: dir.z * speed + (Math.random() - 0.5) * 0.4,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        kind: 'push',
      });
      this.scene.add(mesh);
    }
    // little squash
    if (this.pizzaGroup) {
      this.squash = 0.22;
    }
  }

  celebrate() {
    if (this._celebrated) return;
    this._celebrated = true;
    const colors = [0xffd166, 0xd8492b, 0x67a84a, 0xfff5e1, 0xef8b2c];
    for (let i = 0; i < 70; i++) {
      const geo = new THREE.BoxGeometry(0.08, 0.02, 0.14);
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4);
      this.confetti.push({
        mesh,
        vx: (Math.random() - 0.5) * 1.8,
        vy: 1.5 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 1.8,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 8,
        life: 3 + Math.random() * 1.5,
      });
      this.scene.add(mesh);
    }
  }

  slideToOven() {
    if (!this.pizzaGroup) return;
    this.phase = 'cooking';
    this._slideStart = {
      pos: this.pizzaGroup.position.clone(),
      scale: this.pizzaGroup.scale.x,
      rot: this.pizzaGroup.rotation.y,
      t: 0,
    };
    this._slideTarget = new THREE.Vector3(2.35, -0.15, -2.85);
    this.cameraGoal = { pos: new THREE.Vector3(2.8, 6.2, 6.6), look: new THREE.Vector3(1.6, 0, -1.8) };
    this.ovenOn = true;
  }

  resetPizza() {
    this.phase = 'making';
    this.stage = 'dough';
    this.dough = null;
    this._celebrated = false;
    this._slideStart = null;
    this.cameraGoal = { pos: new THREE.Vector3(0, 10.9, 7.9), look: new THREE.Vector3(0, -0.5, 0) };
    this.ovenOn = false;
    if (this.pizzaGroup) {
      this.pizzaGroup.visible = true;
      this.pizzaGroup.position.set(0, 0, 0);
      this.pizzaGroup.scale.setScalar(1);
      this.pizzaGroup.rotation.set(0, 0, 0);
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onCameraChange?.();
  }

  // Project the pizza board to CSS pixel coordinates so HTML controls can hug it.
  boardScreenRect() {
    if (!this.pizzaGroup) return null;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return null;
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const half = 5.1 / 2 + 0.3;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const v = new THREE.Vector3(sx * half, 0.1, sz * half);
      this.pizzaGroup.localToWorld(v);
      v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  _animate() {
    this._raf = requestAnimationFrame(this._animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (this.controls) this.controls.update();

    if (this.cameraGoal) {
      this.camera.position.lerp(this.cameraGoal.pos, 0.035);
      this.controls.target.lerp(this.cameraGoal.look, 0.035);
      if (this.camera.position.distanceTo(this.cameraGoal.pos) < 0.05) this.cameraGoal = null;
    }

    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 1.6);
      const s = 1 + Math.sin(this.squash * 18) * this.squash * 0.08;
      if (this.pizzaGroup) this.pizzaGroup.scale.set(s, 1 - this.squash * 0.05, s);
    } else if (this.pizzaGroup && this.phase === 'making') {
      this.pizzaGroup.scale.setScalar(1);
    }

    if (this._slideStart && this.pizzaGroup) {
      const start = this._slideStart;
      start.t = Math.min(1, start.t + dt / 1.25);
      const e = 1 - Math.pow(1 - start.t, 3);
      this.pizzaGroup.position.lerpVectors(start.pos, this._slideTarget, e);
      this.pizzaGroup.position.y += Math.sin(e * Math.PI) * 0.8;
      this.pizzaGroup.scale.setScalar(start.scale * (1 - e * 0.55));
      this.pizzaGroup.rotation.y = start.rot + e * 0.9;
      if (start.t >= 1) this.pizzaGroup.visible = false;
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      e.mesh.position.x += e.vx * dt;
      e.mesh.position.y += e.vy * dt;
      e.mesh.position.z += e.vz * dt;
      e.vy -= 5.5 * dt;
      e.mesh.material.opacity = Math.min(1, e.life / e.maxLife);
    }

    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        this.confetti.splice(i, 1);
        continue;
      }
      c.vy -= 4.5 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.vr * dt;
      c.mesh.rotation.z += c.vr * dt;
      c.mesh.material.opacity = Math.min(1, c.life);
      c.mesh.material.transparent = true;
    }

    if (this.ghostSprites.length) {
      for (let i = 0; i < this.ghostSprites.length; i++) {
        const s = this.ghostSprites[i];
        s.position.y = s.userData.baseY + Math.sin(t * 2 + i * 0.7) * 0.045;
        s.material.opacity = 0.3 + Math.sin(t * 2.5 + i) * 0.08;
      }
    }

    if (this.highlight && this.highlight.visible) {
      this.highlight.material.opacity = 0.17 + Math.sin(t * 4) * 0.07;
      this.highlightArrow.position.y = 0.5 + Math.sin(t * 4) * 0.06;
    }

    if (this.ovenLight) {
      const base = this.ovenOn ? 9 : 1.2;
      this.ovenLight.intensity = base + Math.sin(t * 9) * (this.ovenOn ? 2.5 : 0.4);
      if (this.ovenGlow) this.ovenGlow.material.opacity = (this.ovenOn ? 0.55 : 0.28) + Math.sin(t * 7) * 0.1;
    }

    if (this.dust) {
      const pos = this.dust.geometry.attributes.position;
      for (let i = 0; i < this.particleSeeds.length; i++) {
        const seed = this.particleSeeds[i];
        pos.array[i * 3 + 1] = seed.y + Math.sin(t * seed.speed + seed.phase) * 0.4;
      }
      pos.needsUpdate = true;
      this.dust.rotation.y += dt * 0.006;
    }

    // pop-in accent meshes
    for (const mesh of this.accentMeshes) {
      if (!mesh.parent) continue;
      if (mesh.scale.x < 1) {
        mesh.scale.x = Math.min(1, mesh.scale.x + dt * 5);
        mesh.scale.y = mesh.scale.x;
        mesh.scale.z = mesh.scale.x;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this._disposeGroup(this.pizzaGroup);
    this.renderer.dispose();
  }
}
