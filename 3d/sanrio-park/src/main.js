import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaedcff);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const characters = [];
let activeCharacter = null;

let selectionRing = null;
let selectionRingStartTime = 0;
const selectionRingDuration = 1000;

camera.position.set(0, 1, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

// 光
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x88aa88, 2.0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// 地面
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x7fcf7f })
);
ground.rotation.x = -Math.PI / 2;
ground.name = 'ground';

scene.add(ground);

// 簡易公園オブジェクト
function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  );
  trunk.position.set(x, 0.6, z);
  scene.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x3fa34d })
  );
  leaves.position.set(x, 1.5, z);
  scene.add(leaves);
}

addTree(-4, -3);
addTree(4, -4);
addTree(-5, 3);
addTree(5, 2);


// GLB読み込み
const loader = new GLTFLoader();

function loadCharacter(path, x, z, scale = 2, initialYaw = Math.PI) {
  loader.load(path, (gltf) => {
    const model = gltf.scene;

    model.scale.setScalar(scale);

    // キャラ全体を入れる親グループ。これを回転・移動の本体にする
    const character = new THREE.Group();

    // モデルのバウンディングボックスを取得
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // モデルの中心を親グループの原点に合わせる
    model.position.x -= center.x;
    model.position.z -= center.z;

    // 足元を地面に合わせる
    model.position.y -= box.min.y;

    character.add(model);

    character.position.set(x, 0, z);
    character.rotation.y = initialYaw;

    character.userData.isCharacter = true;
    character.userData.targetPosition = character.position.clone();
    character.userData.targetYaw = initialYaw;

    model.traverse((obj) => {
      obj.userData.rootCharacter = character;

      if (obj.isMesh && obj.material?.map) {
        obj.material.map.colorSpace = THREE.SRGBColorSpace;
        obj.material.needsUpdate = true;
      }
    });

    characters.push(character);
    scene.add(character);
  });
}

loadCharacter('/models/cinnamoroll.glb', 0, -3.0, 2.0, -Math.PI/2);
loadCharacter('/models/mymelody.glb', -1.7, -1.2, 2.0, -Math.PI/2+0.5);
loadCharacter('/models/kuromi.glb', 1.7, -1.2, 2.0, -Math.PI/2-0.5);

// 歩行操作
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

let yaw = 0;

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') yaw += 0.08;
  if (e.key === 'ArrowRight') yaw -= 0.08;
});

function updateMovement() {
  const speed = 0.06;

  const forward = new THREE.Vector3(
    Math.sin(yaw),
    0,
    Math.cos(yaw) * -1
  );

  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    Math.sin(yaw)
  );

  if (keys['w']) camera.position.addScaledVector(forward, speed);
  if (keys['s']) camera.position.addScaledVector(forward, -speed);
  if (keys['a']) camera.position.addScaledVector(right, -speed);
  if (keys['d']) camera.position.addScaledVector(right, speed);

  camera.rotation.set(0, yaw, 0);

  // 公園の範囲制限
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -18, 18);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -18, 18);
  camera.position.y = 1.55;
}

function animate() {
  requestAnimationFrame(animate);

  updateMovement();
  updateCharacters();

  updateSelectionRing();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObjects(scene.children, true);

  if (hits.length === 0) return;

  const first = hits[0];
  const clickedRoot = first.object.userData.rootCharacter;

  // キャラをクリックした場合
  if (clickedRoot) {
    activeCharacter = clickedRoot;

    selectionRing.visible = true;
    selectionRingStartTime = performance.now();

    selectionRing.position.x = activeCharacter.position.x;
    selectionRing.position.z = activeCharacter.position.z;

    return;
  }

  // キャラ以外、つまり地面などをクリックした場合
  if (activeCharacter && first.object.name === 'ground') {
    const p = first.point;

    activeCharacter.userData.targetPosition = new THREE.Vector3(
      p.x,
      activeCharacter.position.y,
      p.z
    );
  }
});

function updateCharacters() {
  for (const character of characters) {
    const target = character.userData.targetPosition;
    if (!target) continue;

    const current = character.position;

    const direction = new THREE.Vector3().subVectors(target, current);
    direction.y = 0;

    const distance = direction.length();

    if (distance > 0.03) {
      direction.normalize();

      const speed = 0.035;
      current.addScaledVector(direction, Math.min(speed, distance));

      // 進行方向を目標角度にする
      character.userData.targetYaw = Math.atan2(direction.x, direction.z) - Math.PI / 2;
    }

    // いきなり向きを変えず、少しずつ回転
    const currentYaw = character.rotation.y;
    const targetYaw = character.userData.targetYaw;

    let diff = targetYaw - currentYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));

    const rotateSpeed = 0.08;
    character.rotation.y += diff * rotateSpeed;
  }
}

function createSelectionRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.85, 64),
    new THREE.MeshBasicMaterial({
      color: 0xb8f5b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    })
  );

  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;

  scene.add(ring);
  return ring;
}

selectionRing = createSelectionRing();

function updateSelectionRing() {
  if (!activeCharacter || !selectionRing) return;

  const elapsed = performance.now() - selectionRingStartTime;
  const t = elapsed / selectionRingDuration;

  if (t >= 1) {
    selectionRing.visible = false;
    selectionRing.material.opacity = 0;
    return;
  }

  selectionRing.visible = true;

  selectionRing.position.x = activeCharacter.position.x;
  selectionRing.position.z = activeCharacter.position.z;

  selectionRing.material.opacity = 0.75 * (1 - t);

  const scale = 1 + t * 0.35;
  selectionRing.scale.set(scale, scale, scale);
}
