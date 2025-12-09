// ===== Basic scene setup =====
const scene = new THREE.Scene();
scene.background = new THREE.Color('white');

// Camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(4, 4, 8);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.physicallyCorrectLights = true;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);

// ===== Lights =====
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.9);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

// ===== Ground =====
const planeGeo = new THREE.PlaneGeometry(40, 40);
const planeMat = new THREE.MeshStandardMaterial({
  color: 0x111111,
  roughness: 0.8,
  metalness: 0.0
});
const ground = new THREE.Mesh(planeGeo, planeMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
ground.name = 'ground';
scene.add(ground);

// ===== Grid snapping =====
const gridSize = 1;

function snapToGrid(value) {
  return Math.round(value / gridSize) * gridSize;
}

// ===== Materials for blocks =====
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x88cfff,
  roughness: 0.05,
  metalness: 0.0,
  transmission: 1.0, // glass feel
  thickness: 0.8,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1
});

const solidMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ff99,
  roughness: 0.35,
  metalness: 0.15
});

let useGlass = true;
const blocks = [];

// ===== createBlock: one unique block =====
function createBlock(x, y, z, id) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const baseMaterial = useGlass ? glassMaterial : solidMaterial;
  const material = baseMaterial.clone();

  // Slight color variation in solid mode
  if (!useGlass) {
    const color = new THREE.Color(0x00ff99);
    color.offsetHSL((id || 0) * 0.05, 0, 0);
    material.color = color;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;

  mesh.userData.id = id ?? blocks.length;
  mesh.userData.type = 'block';

  scene.add(mesh);
  blocks.push(mesh);
  return mesh;
}

// ===== getNextStackY: vertical stacking at a given X/Z =====
function getNextStackY(x, z) {
  const eps = 0.001;
  let count = 0;

  blocks.forEach(b => {
    if (Math.abs(b.position.x - x) < eps && Math.abs(b.position.z - z) < eps) {
      count++;
    }
  });

  // centers at 0.5, 1.5, 2.5, ...
  return count * gridSize + 0.5;
}

// ===== Initial blocks =====
createBlock(-1.5, 0.5, 0, 0);
createBlock(0,    0.5, 0, 1);
createBlock(1.5,  0.5, 0, 2);

// ===== UI hooks =====
const addButton = document.getElementById('add-block');
const styleButton = document.getElementById('style-toggle');

// Add Block: random X/Z around, snapped & stacked
if (addButton) {
  addButton.addEventListener('click', () => {
    const range = 8;

    const rawX = (Math.random() - 0.5) * range;
    const rawZ = (Math.random() - 0.5) * range;

    const x = snapToGrid(rawX);
    const z = snapToGrid(rawZ);
    const y = getNextStackY(x, z);

    const id = blocks.length;
    createBlock(x, y, z, id);
  });
}

// Toggle glass / solid
if (styleButton) {
  styleButton.addEventListener('click', () => {
    useGlass = !useGlass;
    blocks.forEach((b, idx) => {
      const baseMaterial = useGlass ? glassMaterial : solidMaterial;
      const mat = baseMaterial.clone();

      if (!useGlass) {
        const color = new THREE.Color(0x00ff99);
        color.offsetHSL(idx * 0.05, 0, 0);
        mat.color = color;
      }

      b.material = mat;
    });
  });
}

// ===== Dragging + click-to-place =====
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0
const planeIntersectPoint = new THREE.Vector3();
let selectedBlock = null;
let dragOffset = new THREE.Vector3();
let selectedBlockInitialY = 0;

function updateMouseFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// Use pointer events to be more robust than mouse*
renderer.domElement.addEventListener('pointerdown', (event) => {
  updateMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);

  // First: did we click a block?
  const blockIntersects = raycaster.intersectObjects(blocks, false);
  if (blockIntersects.length > 0) {
    selectedBlock = blockIntersects[0].object;
    selectedBlockInitialY = selectedBlock.position.y;

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
      dragOffset.copy(planeIntersectPoint).sub(selectedBlock.position);
    }

    // Disable OrbitControls while dragging so you don't fight the camera
    controls.enabled = false;
    return;
  }

  // If not a block: click on ground to place a new block
  const groundIntersects = raycaster.intersectObject(ground, false);
  if (groundIntersects.length > 0) {
    const point = groundIntersects[0].point;

    const snappedX = snapToGrid(point.x);
    const snappedZ = snapToGrid(point.z);
    const y = getNextStackY(snappedX, snappedZ);
    const id = blocks.length;

    createBlock(snappedX, y, snappedZ, id);
  }
});

window.addEventListener('pointermove', (event) => {
  if (!selectedBlock) return;

  updateMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);

  if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
    const newPos = planeIntersectPoint.clone().sub(dragOffset);

    const snappedX = snapToGrid(newPos.x);
    const snappedZ = snapToGrid(newPos.z);

    selectedBlock.position.set(snappedX, selectedBlockInitialY, snappedZ);
  }
});

window.addEventListener('pointerup', () => {
  selectedBlock = null;
  controls.enabled = true;
});

// ===== Animation loop =====
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
