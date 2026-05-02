import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_DEFS, getPlayerDef, getUnlockedDefs, switchPlayer, unlockCharacter } from './characters.js';
import { buildWorld } from './world.js';

import cinnamorollUrl from './models/cinnamoroll.glb?url';
import mymelodyUrl from './models/mymelody.glb?url';
import kuromiUrl from './models/kuromi.glb?url';
import mirukuUrl from './models/miruku.glb?url';

const MODEL_URLS = {
  cinnamoroll: cinnamorollUrl,
  mymelody: mymelodyUrl,
  kuromi: kuromiUrl,
  miruku: mirukuUrl,
};

// ---- Scene ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.touchAction = 'none'; // Safari touch対応

scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa88, 2.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x4caf50 })
);
ground.rotation.x = -Math.PI / 2;
ground.name = 'ground';
scene.add(ground);

buildWorld(scene, ground);

// ---- Constants ----
const MOVE_SPEED = 2.5;
const POP_DURATION = 0.3;
const NPC_WANDER_RADIUS = 3;
const NPC_WANDER_MIN = 2;
const NPC_WANDER_MAX = 6;

// ---- Character runtime state ----
// characters: id -> { def, group, glowMaterials, pos(Vector2=XZ), targetPos(Vector2=XZ),
//                     yaw, targetYaw, popProgress, wanderTimer }
const characters = {};

function createBubble() {
  const el = document.createElement('div');
  el.className = 'speech-bubble';
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}

function createRuntime(def) {
  return {
    def,
    group: null,
    glowMaterials: [],
    pos: new THREE.Vector2(def.initPos.x, def.initPos.z),
    targetPos: new THREE.Vector2(def.initPos.x, def.initPos.z),
    yaw: 0,
    targetYaw: 0,
    popProgress: -1,
    wanderTimer: 1 + Math.random() * 2,
    bubble: createBubble(),
    bubbleTimer: 0,
    dialogueTimer: 4 + Math.random() * 8,  // 最初のセリフまでのウェイト
  };
}

const loader = new GLTFLoader();
const clock = new THREE.Clock();

function loadCharacter(id) {
  const ch = characters[id];
  if (!ch || ch.group) return;

  loader.load(MODEL_URLS[id], (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(ch.def.modelScale ?? 2);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.needsUpdate = true; }
        m.emissive = new THREE.Color(0x000000);
        ch.glowMaterials.push(m);
      });
    });

    const group = new THREE.Group();
    group.add(model);
    group.position.set(ch.pos.x, 0, ch.pos.y);
    ch.group = group;
    scene.add(group);

    // 登場ポップアニメーション
    requestAnimationFrame(() => triggerPop(ch));
  });
}

function spawnCharacter(id) {
  const def = CHARACTER_DEFS.find(d => d.id === id);
  if (!def || characters[id]) return;
  characters[id] = createRuntime(def);
  loadCharacter(id);
}

// 初期登場キャラ（unlocked: true のもの）
getUnlockedDefs().forEach(def => spawnCharacter(def.id));

// 後から登場するキャラ（ゲームイベントで呼び出すことを想定、今はタイマーで）
setTimeout(() => {
  unlockCharacter('kuromi');
  spawnCharacter('kuromi');
  showNotification('クロミが登場！');
}, 20000);

setTimeout(() => {
  unlockCharacter('miruku');
  spawnCharacter('miruku');
  showNotification('ミルクが登場！');
}, 40000);

// ---- Input ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

window.addEventListener('pointerup', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // キャラクタークリック → ポップリアクション
  for (const id in characters) {
    const ch = characters[id];
    if (!ch.group) continue;
    if (raycaster.intersectObject(ch.group, true).length > 0) {
      triggerPop(ch);
      return;
    }
  }

  // 地面クリック → プレイヤー移動
  const playerDef = getPlayerDef();
  if (!playerDef) return;
  const playerCh = characters[playerDef.id];
  if (!playerCh?.group) return;

  if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
  playerCh.targetPos.set(hitPoint.x, hitPoint.z);
});

function triggerPop(ch) {
  ch.popProgress = 0;
  ch.glowMaterials.forEach(m => { m.emissive.set(0xffffff); m.emissiveIntensity = 0; });
}

// ---- Per-frame updates ----

function updateMovement(ch, delta) {
  if (!ch.group) return;
  const dx = ch.targetPos.x - ch.pos.x;
  const dz = ch.targetPos.y - ch.pos.y;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return;
  // 移動方向を向く
  ch.targetYaw = Math.atan2(dx, dz) - Math.PI / 2;
  const step = Math.min(MOVE_SPEED * delta, dist);
  ch.pos.x += (dx / dist) * step;
  ch.pos.y += (dz / dist) * step;
  ch.group.position.set(ch.pos.x, 0, ch.pos.y);
}

function updateRotation(ch) {
  if (!ch.group) return;
  let diff = ch.targetYaw - ch.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ch.yaw += diff * 0.1;
  ch.group.rotation.y = ch.yaw;
}

function updateNpcWander(ch, delta) {
  if (!ch.group || ch.def.isPlayer) return;
  ch.wanderTimer -= delta;
  if (ch.wanderTimer > 0) return;
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * NPC_WANDER_RADIUS;
  ch.targetPos.set(
    ch.def.initPos.x + Math.cos(angle) * r,
    ch.def.initPos.z + Math.sin(angle) * r,
  );
  ch.wanderTimer = NPC_WANDER_MIN + Math.random() * (NPC_WANDER_MAX - NPC_WANDER_MIN);
}

function updatePop(ch, delta) {
  if (ch.popProgress < 0 || !ch.group) return;
  ch.popProgress += delta / POP_DURATION;
  if (ch.popProgress >= 1) {
    ch.group.scale.setScalar(1);
    ch.glowMaterials.forEach(m => { m.emissive.set(0x000000); m.emissiveIntensity = 1; });
    ch.popProgress = -1;
    return;
  }
  const t = Math.sin(ch.popProgress * Math.PI);
  ch.group.scale.setScalar(1 + 0.15 * t);
  ch.glowMaterials.forEach(m => { m.emissiveIntensity = t * 0.5; });
}

// ---- NPC セリフ ----
const DIALOGUE_SHOW = 3.5;
const DIALOGUE_INTERVAL_MIN = 6;
const DIALOGUE_INTERVAL_MAX = 14;
const _headVec = new THREE.Vector3();

function updateNpcDialogue(ch, delta) {
  // プレイヤーになったら吹き出し非表示
  if (ch.def.isPlayer) {
    ch.bubble.style.display = 'none';
    ch.bubbleTimer = 0;
    return;
  }
  if (!ch.group) return;

  // 表示中タイマーのカウントダウン
  if (ch.bubbleTimer > 0) {
    ch.bubbleTimer -= delta;
    ch.bubble.style.opacity = ch.bubbleTimer < 0.6
      ? String(ch.bubbleTimer / 0.6)
      : '1';
    if (ch.bubbleTimer <= 0) ch.bubble.style.display = 'none';
  }

  // 次のセリフまでのカウントダウン
  ch.dialogueTimer -= delta;
  if (ch.dialogueTimer > 0) return;

  const lines = ch.def.npcDialogues;
  ch.bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
  ch.bubble.style.display = 'block';
  ch.bubble.style.opacity = '1';
  ch.bubbleTimer = DIALOGUE_SHOW;
  ch.dialogueTimer = DIALOGUE_INTERVAL_MIN + Math.random() * (DIALOGUE_INTERVAL_MAX - DIALOGUE_INTERVAL_MIN);
}

function updateBubblePositions() {
  for (const id in characters) {
    const ch = characters[id];
    if (ch.bubble.style.display === 'none') continue;

    // キャラ頭上の3D座標 → スクリーン座標に投影
    const headHeight = (ch.def.modelScale ?? 2) * 0.95;
    _headVec.set(ch.pos.x, headHeight, ch.pos.y);
    _headVec.project(camera);

    if (_headVec.z > 1) { ch.bubble.style.display = 'none'; continue; } // カメラの後ろ

    ch.bubble.style.left = `${(_headVec.x + 1) / 2 * window.innerWidth}px`;
    ch.bubble.style.top  = `${(-_headVec.y + 1) / 2 * window.innerHeight}px`;
  }
}

// ---- Camera (プレイヤーを滑らかに追従) ----
const camTarget = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();

function updateCamera() {
  const playerDef = getPlayerDef();
  if (!playerDef) return;
  const ch = characters[playerDef.id];
  if (!ch?.group) return;
  _tmpVec.set(ch.pos.x, 0, ch.pos.y);
  camTarget.lerp(_tmpVec, 0.06);
  camera.position.set(camTarget.x, camTarget.y + 3, camTarget.z + 5);
  camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
}

// ---- Animation loop ----
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  for (const id in characters) {
    const ch = characters[id];
    updateNpcWander(ch, delta);
    updateMovement(ch, delta);
    updateRotation(ch);
    updatePop(ch, delta);
    updateNpcDialogue(ch, delta);
  }

  updateCamera();
  updateBubblePositions();
  renderer.render(scene, camera);
}
animate();

// ---- UI ----
function updatePlayerLabel() {
  const def = getPlayerDef();
  const label = document.getElementById('player-label');
  if (label && def) label.textContent = `▶ ${def.name} 操作中`;
}

document.getElementById('change-btn').addEventListener('click', () => {
  const ids = getUnlockedDefs().map(d => d.id);
  const curId = getPlayerDef()?.id;
  const nextId = ids[(ids.indexOf(curId) + 1) % ids.length];
  switchPlayer(nextId);
  updatePlayerLabel();
});

updatePlayerLabel();

function showNotification(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3000);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
