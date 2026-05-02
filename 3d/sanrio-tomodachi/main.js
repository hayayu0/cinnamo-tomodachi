import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_DEFS, getPlayerDef, getUnlockedDefs, switchPlayer, unlockCharacter } from './characters.js';
import { buildWorld } from './world.js';
import { setupShop, SHOP_ITEMS } from './shop.js';

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
function virtualW() { return Math.max(640, window.innerWidth); }
function virtualH() { return Math.round(virtualW() * window.innerHeight / window.innerWidth); }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(virtualW(), virtualH());
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;touch-action:none;';

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
const NPC_WANDER_MIN = 4;
const NPC_WANDER_MAX = 12;

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
    shakeProgress: -1,
    wanderTimer: 1 + Math.random() * 2,
    bubble: createBubble(),
    bubbleTimer: 0,
    playerBubbleTimer: 0,
    dialogueTimer: 4 + Math.random() * 8,  // 最初のセリフまでのウェイト
    coins: def.startCoins ?? 500,
    mood: def.mood ?? 80,
    hunger: def.hunger ?? 60,
    items: [],
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
}, 90000);   // 90秒後

setTimeout(() => {
  unlockCharacter('miruku');
  spawnCharacter('miruku');
  showNotification('ミルクが登場！');
}, 180000);  // 180秒後

// ---- Input ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

window.addEventListener('pointerup', (event) => {
  if (event.target !== renderer.domElement) return; // ボタン等のUI操作を無視
  const shopPanel = document.getElementById('shop-panel');
  if (shopPanel.classList.contains('open')) {
    shopPanel.classList.remove('open');
    updateStatusBars();
    return;
  }
  if (givePanelEl.classList.contains('open')) {
    givePanelEl.classList.remove('open');
    return;
  }
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // キャラクタークリック → ポップリアクション
  for (const id in characters) {
    const ch = characters[id];
    if (!ch.group) continue;
    if (raycaster.intersectObject(ch.group, true).length > 0) {
      triggerPop(ch);
      if (!ch.def.isPlayer) {
        showGiveBtn(id);
      } else {
        hideGiveBtn();
      }
      return;
    }
  }

  // 地面クリック → あげるボタン非表示＆プレイヤー移動
  hideGiveBtn();
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

function triggerShake(ch) {
  ch.shakeProgress = 0;
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

const SHAKE_DURATION = 0.6;
function updateShake(ch, delta) {
  if (ch.shakeProgress < 0 || !ch.group) return;
  ch.shakeProgress += delta / SHAKE_DURATION;
  if (ch.shakeProgress >= 1) {
    ch.group.position.set(ch.pos.x, 0, ch.pos.y);
    ch.shakeProgress = -1;
    return;
  }
  const decay = 1 - ch.shakeProgress;
  const offset = Math.sin(ch.shakeProgress * Math.PI * 14) * 0.12 * decay;
  ch.group.position.set(ch.pos.x + offset, 0, ch.pos.y);
}

// ---- 感情パーティクル ----
const POSITIVE_EMOJIS = ['💓', '✨', '🌟', '💕', '⭐'];
const NEGATIVE_EMOJIS = ['🌪', '🌀', '💨', '😵', '💫'];

function spawnParticles(ch, positive) {
  if (!ch.group) return;
  const headHeight = (ch.def.modelScale ?? 2) * 0.95;
  _headVec.set(ch.pos.x, headHeight, ch.pos.y);
  _headVec.project(camera);
  if (_headVec.z > 1) return; // カメラの後ろ

  const sx  = (_headVec.x + 1) / 2 * window.innerWidth;
  const sy  = (-_headVec.y + 1) / 2 * window.innerHeight;
  // 地面（画面下端）に向けて25%近づけた開始位置
  const startY = sy + 0.25 * (window.innerHeight - sy);
  const emojis = positive ? POSITIVE_EMOJIS : NEGATIVE_EMOJIS;

  for (let i = 0; i < 4; i++) {
    const p = document.createElement('div');
    p.className = 'emotion-particle' + (positive ? '' : ' shake');
    p.textContent = emojis[i % emojis.length];
    p.style.left = `${sx + (Math.random() - 0.5) * 60}px`;
    p.style.top  = `${startY}px`;
    p.style.animationDelay = `${i * 0.13}s`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), (i * 0.13 + 1.3) * 1000);
  }
}

// ---- アイテム投げアニメーション ----
function animateGift(fromCh, toCh, emoji, onArrive) {
  const fv = new THREE.Vector3(fromCh.pos.x, (fromCh.def.modelScale ?? 2) * 0.95, fromCh.pos.y).project(camera);
  const tv = new THREE.Vector3(toCh.pos.x,  (toCh.def.modelScale  ?? 2) * 0.95, toCh.pos.y ).project(camera);

  const sx = (fv.x + 1) / 2 * window.innerWidth;
  const sy = (-fv.y + 1) / 2 * window.innerHeight;
  const ex = (tv.x + 1) / 2 * window.innerWidth;
  const ey = (-tv.y + 1) / 2 * window.innerHeight;
  const cx = (sx + ex) / 2;
  const cy = Math.min(sy, ey) - 140;

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;font-size:48px;pointer-events:none;z-index:300;transform:translate(-50%,-50%)';
  el.textContent = emoji;
  document.body.appendChild(el);

  const duration = 850;
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const u = 1 - t;
    el.style.left = `${u*u*sx + 2*u*t*cx + t*t*ex}px`;
    el.style.top  = `${u*u*sy + 2*u*t*cy + t*t*ey}px`;
    if (t < 1) { requestAnimationFrame(frame); } else { el.remove(); onArrive(); }
  }
  requestAnimationFrame(frame);
}

function showReaction(ch, key) {
  const r = ch.def.giftReactions ?? {};
  ch.bubble.textContent = r[key] ?? 'ありがとう';
  ch.bubble.style.display = 'block';
  ch.bubble.style.opacity = '1';
  ch.bubbleTimer   = DIALOGUE_SHOW;
  ch.dialogueTimer = DIALOGUE_INTERVAL_MIN + Math.random() * (DIALOGUE_INTERVAL_MAX - DIALOGUE_INTERVAL_MIN);
}

const DIALOGUE_SHOW = 3.5;
const DIALOGUE_INTERVAL_MIN = 20;
const DIALOGUE_INTERVAL_MAX = 30;
const _headVec = new THREE.Vector3();

function updateNpcDialogue(ch, delta) {
  if (ch.def.isPlayer) {
    if (ch.playerBubbleTimer > 0) {
      ch.playerBubbleTimer -= delta;
      ch.bubble.style.opacity = ch.playerBubbleTimer < 0.6 ? String(ch.playerBubbleTimer / 0.6) : '1';
      if (ch.playerBubbleTimer <= 0) ch.bubble.style.display = 'none';
    } else {
      ch.bubble.style.display = 'none';
    }
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

// アスペクト比から「横長らしさ」を 0(細長い縦) → 1(横長) で滑らかに返す。
// これを使ってカメラ位置とFOVを補間し、1:1境界でズームが急変するのを防ぐ。
function aspectT() {
  const aspect = window.innerWidth / window.innerHeight;
  return THREE.MathUtils.clamp((aspect - 0.6) / 1.0, 0, 1); // 0.6→0, 1.6→1
}

function updateCamera() {
  const playerDef = getPlayerDef();
  if (!playerDef) return;
  const ch = characters[playerDef.id];
  if (!ch?.group) return;
  _tmpVec.set(ch.pos.x, 0, ch.pos.y);
  camTarget.lerp(_tmpVec, 0.06);
  const t = aspectT();
  const camY = THREE.MathUtils.lerp(6, 3, t);
  const camZ = THREE.MathUtils.lerp(9, 5, t);
  camera.position.set(camTarget.x, camTarget.y + camY, camTarget.z + camZ);
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
    updateShake(ch, delta);
    updateNpcDialogue(ch, delta);
  }

  updateCamera();
  updateBubblePositions();
  renderer.render(scene, camera);
}
animate();

// ---- UI ----
function updateStatusBars() {
  const def = getPlayerDef();
  if (!def) return;
  const ch = characters[def.id];
  if (!ch) return;
  const mood   = Math.max(0, Math.min(100, ch.mood));
  const hunger = Math.max(0, Math.min(100, ch.hunger));
  const moodEl   = document.getElementById('mood-fill');
  const hungerEl = document.getElementById('hunger-fill');
  const coinsEl  = document.getElementById('coins-disp-value');
  if (moodEl)   moodEl.style.width   = `${mood}%`;
  if (hungerEl) hungerEl.style.width = `${hunger}%`;
  if (coinsEl)  coinsEl.textContent  = ch.coins;
}

function updatePlayerLabel() {
  const def = getPlayerDef();
  const label = document.getElementById('player-label');
  if (label && def) label.textContent = `▶ ${def.name} 操作中`;
  updateStatusBars();
}

// mood/hunger 時間経過による減少 (1分ごと: 気分-1%, おなか-3%)
setInterval(() => {
  for (const id in characters) {
    const ch = characters[id];
    ch.hunger = Math.max(0, ch.hunger - 3);
    ch.mood   = Math.max(0, ch.mood   - 1);
  }
  updateStatusBars();
}, 60000);

const shop = setupShop({
  getPlayerCharacter: () => {
    const def = getPlayerDef();
    return def ? characters[def.id] : null;
  },
  onPurchase: (item, ch, moodDelta) => {
    showNotification(`${item.emoji} ${item.name}を買いました！`);
    if (moodDelta >= 0) {
      triggerPop(ch);
    } else {
      spawnParticles(ch, false);
      triggerShake(ch);
    }
    updateStatusBars();
  },
  onClose: updateStatusBars,
  onInsufficientFunds: () => showNotification('お金が足りないよ', 1000, true),
});

// ---- あげる機能 ----
let giveTargetId = null;
const giveBtnEl      = document.getElementById('give-btn');
const givePanelEl    = document.getElementById('give-panel');
const approachBtnEl  = document.getElementById('approach-btn');

function showGiveBtn(targetId) {
  giveTargetId = targetId;
  giveBtnEl.style.display = 'block';
  approachBtnEl.style.display = 'block';
}

function hideGiveBtn() {
  giveTargetId = null;
  giveBtnEl.style.display = 'none';
  approachBtnEl.style.display = 'none';
  givePanelEl.classList.remove('open');
}

function approachNpc(targetId) {
  const playerDef = getPlayerDef();
  if (!playerDef) return;
  const playerCh = characters[playerDef.id];
  const targetCh = characters[targetId];
  if (!playerCh || !targetCh) return;
  const dx   = targetCh.pos.x - playerCh.pos.x;
  const dz   = targetCh.pos.y - playerCh.pos.y;
  const dist = Math.hypot(dx, dz);
  const STOP_DIST = 1.5;
  if (dist <= STOP_DIST) return;
  const ratio = (dist - STOP_DIST) / dist;
  playerCh.targetPos.set(playerCh.pos.x + dx * ratio, playerCh.pos.y + dz * ratio);
}

approachBtnEl.addEventListener('click', () => {
  if (giveTargetId) approachNpc(giveTargetId);
  hideGiveBtn();
});

function renderGivePanel() {
  const playerDef = getPlayerDef();
  if (!playerDef) return;
  const playerCh = characters[playerDef.id];
  const targetCh = giveTargetId ? characters[giveTargetId] : null;
  if (!playerCh || !targetCh) return;

  document.getElementById('give-target-name').textContent = `▶ ${targetCh.def.name} へ`;
  const itemsEl = document.getElementById('give-items');
  itemsEl.innerHTML = '';

  SHOP_ITEMS.forEach((item) => {
    const owned   = Math.min(playerCh.items.filter(i => i === item.id).length, 99);
    const canGive = owned >= 1;
    const isFav   = targetCh && item.id === targetCh.def.favorite;

    const card = document.createElement('div');
    card.className = 'shop-item' + (isFav ? ' shop-item-special' : '');
    card.innerHTML = `
      <div class="item-emoji-wrap">
        <span class="item-emoji">${item.emoji}</span>
        ${owned > 0 ? `<span class="item-badge">${owned}</span>` : ''}
      </div>
      <div class="item-name">${item.name}${isFav ? ' <span class="star-badge">★</span>' : ''}</div>
      <button class="buy-btn give-item-btn" type="button"${canGive ? '' : ' disabled'}>あげる</button>
    `;
    card.querySelector('.give-item-btn').addEventListener('click', () => {
      if (!canGive) return;
      const pCh = characters[getPlayerDef()?.id];
      const tCh = giveTargetId ? characters[giveTargetId] : null;
      if (!pCh || !tCh) return;
      const idx = pCh.items.indexOf(item.id);
      if (idx < 0) return;
      pCh.items.splice(idx, 1);
      givePanelEl.classList.remove('open');
      showNotification(`${item.emoji} ${tCh.def.name}に${item.name}をあげた！`);
      animateGift(pCh, tCh, item.emoji, () => {
        const favMult = item.id === tCh.def.favorite ? 2 : item.id === tCh.def.dislike ? -1 : 1;
        const delta = item.getMoodGain(tCh.def.id) * favMult;
        tCh.mood   = Math.max(0, Math.min(100, tCh.mood + delta));
        tCh.hunger = Math.min(100, tCh.hunger + item.hungerGain);
        if (delta < 0) {
          spawnParticles(tCh, false);
          triggerShake(tCh);
          showReaction(tCh, 'no');
        } else if (item.id === tCh.def.favorite) {
          triggerPop(tCh);
          showReaction(tCh, 'special');
        } else {
          triggerPop(tCh);
          showReaction(tCh, 'thanks');
        }
      });
    });
    itemsEl.appendChild(card);
  });
}

giveBtnEl.addEventListener('click', () => {
  renderGivePanel();
  givePanelEl.classList.add('open');
});

document.getElementById('give-close').addEventListener('click', () => {
  givePanelEl.classList.remove('open');
});

document.getElementById('talk-btn').addEventListener('click', () => {
  const playerCh = characters[getPlayerDef()?.id];
  if (!playerCh) return;
  const lines = playerCh.def.dialogues;
  playerCh.bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
  playerCh.bubble.style.display = 'block';
  playerCh.bubble.style.opacity = '1';
  playerCh.playerBubbleTimer = DIALOGUE_SHOW;
  const btn = document.getElementById('talk-btn');
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, 1000);
});

document.getElementById('change-btn').addEventListener('click', () => {
  const ids = getUnlockedDefs().map(d => d.id);
  const curId = getPlayerDef()?.id;
  const nextId = ids[(ids.indexOf(curId) + 1) % ids.length];
  switchPlayer(nextId);
  const nextCh = characters[nextId];
  if (nextCh) nextCh.coins = Math.min(5000, nextCh.coins + 100);
  document.getElementById('shop-panel').classList.remove('open');
  updatePlayerLabel();
});

updatePlayerLabel();

function showNotification(msg, duration = 3000, isError = false) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), duration);
}

function fmtTime() {
  const n = new Date();
  const mm = String(n.getMonth() + 1).padStart(2, '0');
  const dd = String(n.getDate()).padStart(2, '0');
  const h = n.getHours();
  const mi = String(n.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${h >= 12 ? 'PM' : 'AM'} ${String(h % 12 || 12).padStart(2, '0')}:${mi}`;
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = fmtTime();
}
updateClock();
setInterval(updateClock, 10000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = THREE.MathUtils.lerp(75, 60, aspectT());
  camera.updateProjectionMatrix();
  renderer.setSize(virtualW(), virtualH());
});
