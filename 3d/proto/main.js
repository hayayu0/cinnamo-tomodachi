import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import cinnamorollUrl from './models/cinnamoroll.glb?url';
import mymelodyUrl from './models/mymelody.glb?url';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 3.5);
camera.lookAt(0, 1, 0);

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

const clock = new THREE.Clock();
const loader = new GLTFLoader();
let currentCharacter = null;
let currentType = 'cinnamoroll';
let targetYaw = 0;
let currentYaw = 0;
let popProgress = -1;
const POP_DURATION = 0.3;
let glowMaterials = [];

const loadingOverlay = document.getElementById('loading-overlay');
function showLoading() { loadingOverlay.classList.add('visible'); }
function hideLoading() { loadingOverlay.classList.remove('visible'); }

const modelUrls = {
  cinnamoroll: cinnamorollUrl,
  mymelody: mymelodyUrl,
};

function loadCharacter(type) {
  showLoading();
  glowMaterials = [];
  popProgress = -1;

  if (currentCharacter) {
    scene.remove(currentCharacter);
    currentCharacter = null;
  }

  loader.load(modelUrls[type], (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(2);

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
        if (m.map) {
          m.map.colorSpace = THREE.SRGBColorSpace;
          m.needsUpdate = true;
        }
        m.emissive = new THREE.Color(0x000000);
        glowMaterials.push(m);
      });
    });

    const character = new THREE.Group();
    character.add(model);
    character.position.set(0, 0, 0);
    character.rotation.y = currentYaw;
    currentCharacter = character;
    scene.add(character);
    hideLoading();
  });
}

loadCharacter(currentType);

document.getElementById('change-btn').addEventListener('click', () => {
  currentType = currentType === 'cinnamoroll' ? 'mymelody' : 'cinnamoroll';
  loadCharacter(currentType);
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

window.addEventListener('pointerup', (event) => {
  if (!currentCharacter) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // キャラクターをクリックしたらポップ＋発光アニメーション
  if (raycaster.intersectObject(currentCharacter, true).length > 0) {
    popProgress = 0;
    glowMaterials.forEach((m) => {
      m.emissive.set(0xffffff);
      m.emissiveIntensity = 0;
    });
    return;
  }

  // 地面平面との交点から向く方向を計算
  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, target);
  if (!hit) return;

  const dx = target.x - currentCharacter.position.x;
  const dz = target.z - currentCharacter.position.z;
  targetYaw = Math.atan2(dx, dz) - Math.PI / 2;
});

function updateRotation() {
  if (!currentCharacter) return;
  let diff = targetYaw - currentYaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  currentYaw += diff * 0.08;
  currentCharacter.rotation.y = currentYaw;
}

function updatePop(delta) {
  if (popProgress < 0 || !currentCharacter) return;
  popProgress += delta / POP_DURATION;
  if (popProgress >= 1) {
    currentCharacter.scale.setScalar(1);
    glowMaterials.forEach((m) => {
      m.emissive.set(0x000000);
      m.emissiveIntensity = 1;
    });
    popProgress = -1;
    return;
  }
  const t = Math.sin(popProgress * Math.PI);
  currentCharacter.scale.setScalar(1 + 0.1 * t);
  glowMaterials.forEach((m) => { m.emissiveIntensity = t * 0.5; });
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  updateRotation();
  updatePop(delta);
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
