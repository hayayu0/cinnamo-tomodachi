import * as THREE from 'three';

// ---- Grass texture (Canvasでランダムな明暗パッチ) ----
function createGrassTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#5cb84a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 22 + 6;
    const bright = Math.random() > 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = bright
      ? `rgba(100,185,70,${Math.random() * 0.22})`
      : `rgba(55,148,38,${Math.random() * 0.22})`;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  return tex;
}

// ---- Path (小道) ----
function createPath() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 40),
    new THREE.MeshStandardMaterial({ color: 0xe2cfa0, roughness: 0.95 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.01, 0);
  return mesh;
}

// ---- Tree ----
function createTree(x, z, scale = 1) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7d5234, roughness: 0.9 });
  const leaf1 = new THREE.MeshStandardMaterial({ color: 0x3aa34e, roughness: 0.8 });
  const leaf2 = new THREE.MeshStandardMaterial({ color: 0x4db85e, roughness: 0.8 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.0, 8), trunkMat);
  trunk.position.y = 1.0;
  group.add(trunk);

  const spheres = [
    { r: 1.45, y: 3.2, dx: 0,    dz: 0,    mat: leaf1 },
    { r: 1.05, y: 3.6, dx: 0.9,  dz: 0.4,  mat: leaf2 },
    { r: 1.00, y: 3.5, dx: -0.8, dz: -0.3, mat: leaf1 },
    { r: 0.85, y: 4.1, dx: 0.3,  dz: -0.6, mat: leaf2 },
  ];
  spheres.forEach(({ r, y, dx, dz, mat }) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    s.position.set(dx, y, dz);
    group.add(s);
  });

  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  return group;
}

// ---- Building ----
function adjustColor(hex, factor) {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((hex >> 8)  & 0xff) * factor));
  const b = Math.min(255, Math.round((hex & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function createBuilding(x, z, color, { width = 3.5, height = 4.2, depth = 3.0 } = {}) {
  const group = new THREE.Group();
  const bodyMat  = new THREE.MeshStandardMaterial({ color });
  const darkMat  = new THREE.MeshStandardMaterial({ color: adjustColor(color, 0.75) });
  const doorMat  = new THREE.MeshStandardMaterial({ color: 0xfafafa });
  const winMat   = new THREE.MeshStandardMaterial({ color: 0xb8e0f0, transparent: true, opacity: 0.85 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
  body.position.y = height / 2;
  group.add(body);

  // Roof ledge
  const roofLedge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.28, depth + 0.4), darkMat);
  roofLedge.position.y = height + 0.14;
  group.add(roofLedge);

  // Door frame
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.85, 0.12), darkMat);
  doorFrame.position.set(0, 0.925, depth / 2 + 0.06);
  group.add(doorFrame);

  // Door panel
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.65, 0.06), doorMat);
  door.position.set(0, 0.825, depth / 2 + 0.12);
  group.add(door);

  // Circular window on door
  const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), winMat);
  porthole.position.set(0, 1.45, depth / 2 + 0.15);
  group.add(porthole);

  // Side windows
  [-1.1, 1.1].forEach((wx) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.6, 0.06), winMat);
    win.position.set(wx, height * 0.58, depth / 2 + 0.06);
    group.add(win);

    // Window sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.12), darkMat);
    sill.position.set(wx, height * 0.58 - 0.34, depth / 2 + 0.06);
    group.add(sill);
  });

  group.position.set(x, 0, z);
  return group;
}

// ---- Fence ----
function createFence(x, z, length, rotationY = 0) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });

  // Horizontal rails
  [0.42, 0.82].forEach((y) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, 0.06), mat);
    rail.position.y = y;
    group.add(rail);
  });

  // Pickets
  const spacing = 0.36;
  const count = Math.ceil(length / spacing);
  for (let i = 0; i <= count; i++) {
    const px = -length / 2 + i * spacing;
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.06), mat);
    picket.position.set(px, 0.5, 0);
    group.add(picket);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 4), mat);
    tip.position.set(px, 1.09, 0);
    group.add(tip);
  }

  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  return group;
}

// ---- Trash can ----
function createTrashCan(x, z) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6 });
  const lidMat  = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.52, 12), bodyMat);
  body.position.y = 0.26;
  group.add(body);

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.21, 0.07, 12), lidMat);
  lid.position.y = 0.555;
  group.add(lid);

  group.position.set(x, 0, z);
  return group;
}

// ---- Bench ----
function createBench(x, z, rotationY = 0) {
  const group = new THREE.Group();
  const woodMat  = new THREE.MeshStandardMaterial({ color: 0x9b6332, roughness: 0.9 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 });

  const W = 1.9;  // bench width (X)
  const SY = 0.48; // seat height

  // Seat planks (2 planks along X)
  [-0.08, 0.08].forEach((dz) => {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, 0.16), woodMat);
    plank.position.set(0, SY, dz);
    group.add(plank);
  });

  // Back rest planks
  [0, 0.18].forEach((dy) => {
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, 0.1), woodMat);
    back.position.set(0, SY + 0.18 + dy, -0.24);
    group.add(back);
  });

  // End supports (arc-style metal legs)
  [-W / 2 + 0.12, W / 2 - 0.12].forEach((ex) => {
    // Seat arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, SY, 0.38), metalMat);
    arm.position.set(ex, SY / 2, -0.02);
    group.add(arm);

    // Back post
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), metalMat);
    post.position.set(ex, SY + 0.21, -0.24);
    group.add(post);
  });

  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  return group;
}

// ---- Export: world setup ----
export function buildWorld(scene, ground) {
  // Grass texture
  const grassTex = createGrassTexture();
  ground.material.map = grassTex;
  ground.material.color.set(0xffffff);
  ground.material.needsUpdate = true;

  // Path
  scene.add(createPath());

  // Buildings (奥の列)
  [
    { x: -7,  z: -14, color: 0xff6b6b, opts: { width: 3.8 } },
    { x: -1,  z: -15, color: 0xffcc44, opts: { height: 4.8 } },
    { x:  5.5,z: -14, color: 0x66bbff },
    { x: 11,  z: -13.5, color: 0xff99cc, opts: { width: 3.0, height: 3.8 } },
  ].forEach(({ x, z, color, opts }) => scene.add(createBuilding(x, z, color, opts)));

  // Trees
  [
    { x: -5,  z: -7.5, s: 1.1 },
    { x:  4,  z: -9.0, s: 1.25 },
    { x: -10, z: -5.0, s: 0.95 },
    { x:  9,  z: -5.5, s: 1.05 },
    { x: -12, z: -11,  s: 1.15 },
    { x:  14, z: -10,  s: 1.0  },
  ].forEach(({ x, z, s }) => scene.add(createTree(x, z, s)));

  // Fences
  scene.add(createFence(-7.2, -5,   12, Math.PI / 2));  // 左側縦
  scene.add(createFence(-1.5, -1.2, 5.5));               // 手前左
  scene.add(createFence( 9,   -1.2, 6));                 // 手前右

  // Trash cans (2個、1.1倍)
  [
    { x: -6.8, z: -3.5 },
    { x:  7.5, z: -3.5 },
  ].forEach(({ x, z }) => {
    const obj = createTrashCan(x, z);
    obj.scale.setScalar(1.1);
    scene.add(obj);
  });

  // Benches (3個、1.1倍)　斜め禁止: r は 0 か Math.PI/2 のみ
  [
    { x: -3.5, z: -2.5, r: Math.PI / 2 },  // 左手前、横向き
    { x:  4.5, z: -3.0, r: 0 },             // 右手前、正面向き
    { x: -5.0, z: -5.5, r: Math.PI / 2 },  // 左奥、横向き
  ].forEach(({ x, z, r }) => {
    const obj = createBench(x, z, r);
    obj.scale.setScalar(1.1);
    scene.add(obj);
  });
}