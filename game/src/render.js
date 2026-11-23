// Drawing only: the world's state and the current screen in, pixels out. A three.js
// scene for the 3D city (buildings, roads, cars, people, particles), a DOM overlay for
// the HUD and menus, and a 2D canvas for the minimap. The camera follows the player
// in third person.

import { CAR, CITY, GARAGE, HELI, MISSIONS, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** A wall texture: a dark wall with a grid of lit windows painted on it. */
function wallTexture(rows, base, windowColor) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = windowColor;
  const cols = 4;
  const cw = c.width / cols;
  const ch = c.height / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      g.fillRect(col * cw + 6, r * ch + 8, cw - 12, ch - 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  // r147: canvas textures must be marked sRGB to survive the sRGB output pass.
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** A physically based material: roughness and metalness per surface, optional map. */
function pbr(color, roughness, metalness, map) {
  const opts = { color, roughness, metalness };
  if (map !== undefined) opts.map = map;
  return new THREE.MeshStandardMaterial(opts);
}

/** A car body: a rounded-corner footprint extruded up, so the silhouette is not a box. */
function roundedFootprint(w, l, h, r) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hl = l / 2;
  s.moveTo(-hw + r, -hl);
  s.lineTo(hw - r, -hl);
  s.quadraticCurveTo(hw, -hl, hw, -hl + r);
  s.lineTo(hw, hl - r);
  s.quadraticCurveTo(hw, hl, hw - r, hl);
  s.lineTo(-hw + r, hl);
  s.quadraticCurveTo(-hw, hl, -hw, hl - r);
  s.lineTo(-hw, -hl + r);
  s.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  return g;
}

/** A cabin: a trapezoid side profile (sloped front and rear) extruded across the width. */
function slopedCabin(w, h, l) {
  const s = new THREE.Shape();
  const hl = l / 2;
  const top = hl * 0.62;
  s.moveTo(-hl, 0);
  s.lineTo(hl, 0);
  s.lineTo(top, h);
  s.lineTo(-top, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-w / 2, -h / 2, 0);
  return g;
}

export function createRenderer(canvas, world) {
  const state = world.state;
  const city = state.city;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Filmic tone mapping + sRGB output, and a soft shadow map for the sun.
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 1500);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);
  camera.position.set(0, 40, 80);

  // The sun does the heavy lifting now; the hemisphere fill is kept low.
  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x5a6a4a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdf9e, 1.6);
  sun.position.set(300, 500, 200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -210;
  sun.shadow.camera.right = 210;
  sun.shadow.camera.top = 210;
  sun.shadow.camera.bottom = -210;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 1050;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.03;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  // ---- Static city ----
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 200, CITY.half * 2 + 200),
    pbr(PALETTE.ground, 1.0, 0),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = pbr(PALETTE.road, 0.98, 0);
  const lineMat = pbr(PALETTE.roadLine, 0.95, 0);
  const walkMat = pbr(PALETTE.sidewalk, 0.95, 0);
  const parkMat = pbr(PALETTE.park, 1.0, 0);
  for (const c of city.lines) {
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, CITY.half * 2), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(c, 0.02, 0);
    roadV.receiveShadow = true;
    scene.add(roadV);
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, CITY.roadWidth), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.02, c);
    roadH.receiveShadow = true;
    scene.add(roadH);
    // Centre dashes along each road.
    for (let d = -CITY.half + 20; d < CITY.half; d += 40) {
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 12), lineMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(c, 0.05, d);
      dashV.receiveShadow = true;
      scene.add(dashV);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.2), lineMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(d, 0.05, c);
      dashH.receiveShadow = true;
      scene.add(dashH);
    }
    // Sidewalk strips flanking each road.
    for (const off of [-CITY.roadWidth / 2 - 4, CITY.roadWidth / 2 + 4]) {
      const walkV = new THREE.Mesh(new THREE.PlaneGeometry(6, CITY.half * 2), walkMat);
      walkV.rotation.x = -Math.PI / 2;
      walkV.position.set(c + off, 0.04, 0);
      walkV.receiveShadow = true;
      scene.add(walkV);
      const walkH = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, 6), walkMat);
      walkH.rotation.x = -Math.PI / 2;
      walkH.position.set(0, 0.04, c + off);
      walkH.receiveShadow = true;
      scene.add(walkH);
    }
  }
  for (const park of city.parks) {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(park.x1 - park.x0, park.z1 - park.z0),
      parkMat,
    );
    p.rotation.x = -Math.PI / 2;
    p.position.set((park.x0 + park.x1) / 2, 0.06, (park.z0 + park.z1) / 2);
    p.receiveShadow = true;
    scene.add(p);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 6);
  const trunkMat = pbr(PALETTE.trunk, 1.0, 0);
  // One shared low-poly crown; each tree gets three overlapping lobes instead of a cone.
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const leafMat = new THREE.MeshStandardMaterial({
    color: PALETTE.tree, roughness: 1.0, metalness: 0, flatShading: true,
  });
  const lobeOffsets = [
    { x: 0, y: 4.2, z: 0, s: 2.2 },
    { x: -0.9, y: 3.4, z: 0.3, s: 1.6 },
    { x: 0.8, y: 3.7, z: -0.3, s: 1.7 },
  ];
  for (const t of city.trees) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(t.x, 2, t.z);
    trunk.scale.setScalar(t.s);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Group();
    for (const o of lobeOffsets) {
      const lobe = new THREE.Mesh(crownGeo, leafMat);
      lobe.position.set(o.x, o.y, o.z);
      lobe.scale.set(o.s, o.s * 0.85, o.s);
      lobe.castShadow = true;
      crown.add(lobe);
    }
    crown.position.set(t.x, 0, t.z);
    crown.scale.setScalar(t.s);
    scene.add(crown);
  }

  // Buildings, with one of three facade textures by height.
  const facades = [
    wallTexture(6, '#6a6258', '#ffd98a'),
    wallTexture(10, '#5a6a7a', '#ffe9a8'),
    wallTexture(16, '#7a6a5a', '#ffd98a'),
  ];
  const roofMat = pbr(PALETTE.buildingRoof, 0.92, 0);
  // Meshes that may cast shadows, with their centres, so the shadow pass can switch off
  // distant buildings each frame.
  const buildingMeshes = [];
  // One shared pane geometry; each building gets an InstancedMesh of its windows.
  const paneGeo = new THREE.PlaneGeometry(1, 1);
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0x35424e, roughness: 0.16, metalness: 0,
    emissive: 0x2a1c08, emissiveIntensity: 1,
  });
  for (const b of city.buildings) {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const tex = b.h < 30 ? facades[0] : b.h < 55 ? facades[1] : facades[2];
    const mat = pbr(b.color, 0.92, 0, tex);
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, b.h, d);
    mesh.position.set(cx, b.h / 2, cz);
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push({ mesh, cx, cz });
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 1, d + 0.6);
    roof.position.set(cx, b.h + 0.5, cz);
    roof.receiveShadow = true;
    scene.add(roof);
    // Recessed windows on the +Z face: a thin shell with real openings, and glass panes
    // set just proud of the wall behind it, so the windows read as inset rather than painted.
    const rows = b.h < 30 ? 6 : b.h < 55 ? 10 : 16;
    const cols = 4;
    const cellW = w / cols;
    const cellH = b.h / rows;
    const winW = cellW * 0.62;
    const winH = cellH * 0.55;
    const face = new THREE.Shape();
    face.moveTo(-w / 2, 0);
    face.lineTo(w / 2, 0);
    face.lineTo(w / 2, b.h);
    face.lineTo(-w / 2, b.h);
    face.closePath();
    const paneSpots = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const px = -w / 2 + (c + 0.5) * cellW;
        const py = (r + 0.5) * cellH;
        const hole = new THREE.Path();
        hole.moveTo(px - winW / 2, py - winH / 2);
        hole.lineTo(px + winW / 2, py - winH / 2);
        hole.lineTo(px + winW / 2, py + winH / 2);
        hole.lineTo(px - winW / 2, py + winH / 2);
        hole.closePath();
        face.holes.push(hole);
        paneSpots.push([px, py]);
      }
    }
    const shellGeo = new THREE.ExtrudeGeometry(face, { depth: 0.12, bevelEnabled: false });
    const shell = new THREE.Mesh(shellGeo, pbr(b.color, 0.92, 0));
    shell.position.set(cx, 0, b.z1 + 0.03);
    shell.receiveShadow = true;
    scene.add(shell);
    buildingMeshes.push({ mesh: shell, cx, cz });
    const panes = new THREE.InstancedMesh(paneGeo, paneMat, paneSpots.length);
    const m4 = new THREE.Matrix4();
    const q0 = new THREE.Quaternion();
    const sv = new THREE.Vector3(winW, winH, 1);
    const pv = new THREE.Vector3();
    paneSpots.forEach(([px, py], i) => {
      pv.set(cx + px, py, b.z1 + 0.02);
      m4.compose(pv, q0, sv);
      panes.setMatrixAt(i, m4);
    });
    panes.instanceMatrix.needsUpdate = true;
    scene.add(panes);
  }

  // ---- Dynamic objects: one mesh group per pool slot, synced every frame ----
  const wheelGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.6, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = pbr(0x14161a, 0.98, 0);
  const bodyGeo = roundedFootprint(3.4, 6.4, 1.1, 0.5);
  const cabinGeo = slopedCabin(2.9, 1.0, 3.2);
  const glassMat = pbr(0x2a3542, 0.16, 0);
  const lightBarGeo = new THREE.BoxGeometry(2.2, 0.35, 0.9);
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xff2a2a, roughness: 0.4, metalness: 0, emissive: 0xaa0000,
  });
  const carGroups = [];
  for (const car of state.cars) {
    const g = new THREE.Group();
    const bodyMat = pbr(0x888888, 0.34, 0.15);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.8, -0.4);
    cabin.castShadow = true;
    g.add(cabin);
    for (const [wx, wz] of [[-1.6, 2.1], [1.6, 2.1], [-1.6, -2.1], [1.6, -2.1]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.85, wz);
      wheel.castShadow = true;
      g.add(wheel);
    }
    const light = new THREE.Mesh(lightBarGeo, lightMat);
    light.position.set(0, 2.5, -0.4);
    light.visible = false;
    g.add(light);
    g.visible = false;
    scene.add(g);
    carGroups.push({ group: g, bodyMat, light });
  }

  const personBodyGeo = new THREE.BoxGeometry(1.1, 1.7, 0.6);
  const personHeadGeo = new THREE.SphereGeometry(0.45, 10, 8);
  const personLegGeo = new THREE.BoxGeometry(0.9, 0.9, 0.5);
  function makePerson() {
    const g = new THREE.Group();
    const mat = pbr(0x888888, 0.85, 0);
    const body = new THREE.Mesh(personBodyGeo, mat);
    body.position.y = 1.55;
    g.add(body);
    const head = new THREE.Mesh(personHeadGeo, pbr(0xe8b88a, 0.85, 0));
    head.position.y = 2.8;
    g.add(head);
    const legs = new THREE.Mesh(personLegGeo, pbr(0x2a2d34, 0.9, 0));
    legs.position.y = 0.45;
    g.add(legs);
    g.visible = false;
    scene.add(g);
    return { group: g, mat };
  }
  const playerPerson = makePerson();
  playerPerson.mat.color.setHex(PALETTE.playerShirt);
  const pedPeople = state.peds.map(() => makePerson());
  const copPeople = state.cops.map(() => makePerson());
  for (const c of copPeople) c.mat.color.setHex(0x1a1a2e);

  // Mission marker: a glowing column and a bobbing diamond.
  const markerMat = new THREE.MeshStandardMaterial({
    color: PALETTE.marker, transparent: true, opacity: 0.28, emissive: 0x664400,
    roughness: 0.6, metalness: 0,
  });
  const markerCol = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 60, 16, 1, true),
    markerMat,
  );
  markerCol.position.y = 30;
  scene.add(markerCol);
  const markerGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.4),
    new THREE.MeshStandardMaterial({
      color: PALETTE.marker, emissive: 0x885500, roughness: 0.3, metalness: 0,
    }),
  );
  markerGem.position.y = 12;
  scene.add(markerGem);

  // Police helicopter: body, tail, spinning rotors, and a searchlight cone underneath
  // (the cone only shows at 4+ stars). Built from the same PBR helpers as the cars.
  const heli = new THREE.Group();
  const heliBodyMat = pbr(0x1a1a2e, 0.5, 0.2);
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 6.4), heliBodyMat);
  heliBody.castShadow = true;
  heli.add(heliBody);
  const heliNose = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 2), glassMat);
  heliNose.position.set(0, 0.2, 3.6);
  heli.add(heliNose);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 6), heliBodyMat);
  heliTail.position.set(0, 0.4, -5.6);
  heli.add(heliTail);
  const heliFin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 1.4), heliBodyMat);
  heliFin.position.set(0, 1.2, -8.2);
  heli.add(heliFin);
  for (const sx of [-1.4, 1.4]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 5), pbr(0x555555, 0.7, 0.3));
    skid.position.set(sx, -1.5, 0);
    heli.add(skid);
  }
  const heliRotor = new THREE.Group();
  const rotorMat = pbr(0x222222, 0.6, 0.3);
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, 0.8), rotorMat);
    blade.rotation.y = a;
    heliRotor.add(blade);
  }
  heliRotor.position.y = 1.8;
  heli.add(heliRotor);
  const heliTailRotor = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.3), rotorMat);
    blade.rotation.x = a;
    heliTailRotor.add(blade);
  }
  heliTailRotor.position.set(0.6, 1, -8.2);
  heli.add(heliTailRotor);
  const heliSpot = new THREE.Mesh(
    new THREE.ConeGeometry(7, HELI.hoverHeight, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  heliSpot.position.y = -HELI.hoverHeight / 2 - 1;
  heli.add(heliSpot);
  heli.visible = false;
  scene.add(heli);

  // Roadblock barriers: a striped board between each block's two police cars.
  function stripeTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#ffd21f';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#1a1a2e';
    for (let x = -32; x < 128; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 32);
      g.closePath();
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  const barrierGeo = new THREE.BoxGeometry(16, 1.3, 0.4);
  const barrierMat = new THREE.MeshStandardMaterial({
    map: stripeTexture(), roughness: 0.8, metalness: 0,
  });
  const barriers = state.roadblocks.map(() => {
    const m = new THREE.Mesh(barrierGeo, barrierMat);
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    return m;
  });

  // The garage: a marked bay on the roadside, with a sign on a pole.
  function signTexture(text) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1a2e';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#ffd21f';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 252, 60);
    g.fillStyle = '#ffd21f';
    g.font = 'bold 36px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  const garageZone = new THREE.Mesh(
    new THREE.CircleGeometry(GARAGE.radius, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffd21f, transparent: true, opacity: 0.22, roughness: 1, metalness: 0,
    }),
  );
  garageZone.rotation.x = -Math.PI / 2;
  garageZone.position.set(state.garage.x, 0.08, state.garage.z);
  garageZone.receiveShadow = true;
  scene.add(garageZone);
  const garagePole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 8, 8),
    pbr(0x888888, 0.8, 0.2),
  );
  garagePole.position.set(state.garage.x, 4, state.garage.z);
  garagePole.castShadow = true;
  scene.add(garagePole);
  const garageSign = new THREE.Mesh(
    new THREE.BoxGeometry(9, 2.4, 0.3),
    new THREE.MeshStandardMaterial({ map: signTexture('GARAGE'), roughness: 0.8, metalness: 0 }),
  );
  garageSign.position.set(state.garage.x, 7, state.garage.z);
  garageSign.rotation.y = state.garage.angle;
  garageSign.castShadow = true;
  scene.add(garageSign);

  // Particles as one THREE.Points cloud.
  const pCount = state.particles.length;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  const pCol = new Float32Array(pCount * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: true });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);

  // ---- DOM HUD ----
  const healthFill = document.getElementById('healthfill');
  const moneyEl = document.getElementById('money');
  const starsEl = document.getElementById('stars');
  const objectiveEl = document.getElementById('objective');
  const bannerEl = document.getElementById('banner');
  const crosshairEl = document.getElementById('crosshair');
  const panelEl = document.getElementById('panel');
  const missionsEl = document.getElementById('missions');
  const dispatchEl = document.getElementById('dispatch');
  const statsEl = document.getElementById('stats');
  const speedEl = document.getElementById('speed');
  const radioEl = document.getElementById('radio');
  const mapCanvas = document.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 40, 80);
  let orbitAngle = 0;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function syncCar(i) {
    const car = state.cars[i];
    const slot = carGroups[i];
    if (!car.active) {
      slot.group.visible = false;
      return;
    }
    slot.group.visible = true;
    slot.group.position.set(car.x, 0, car.z);
    slot.group.rotation.y = car.angle;
    slot.bodyMat.color.setHex(car.color);
    slot.light.visible = car.isPolice;
    if (car.isPolice) {
      slot.light.material.emissive.setHex(Math.floor(state.elapsed * 4) % 2 === 0 ? 0xff0000 : 0x0000ff);
    }
    // Wheels spin with speed.
    const spin = car.speed * 0.016;
    for (let w = 2; w < slot.group.children.length; w += 1) {
      const child = slot.group.children[w];
      if (child.geometry === wheelGeo) child.rotation.x += spin;
    }
  }

  function syncPerson(slot, p, isPlayer) {
    if (!p.active && !isPlayer) {
      slot.group.visible = false;
      return;
    }
    slot.group.visible = true;
    slot.group.position.set(p.x, 0, p.z);
    slot.group.rotation.y = p.angle;
    if (p.color !== undefined && slot.mat) slot.mat.color.setHex(p.color);
    // Walk bob.
    const phase = p.walkPhase || 0;
    slot.group.position.y = p.moving ? Math.abs(Math.sin(phase)) * 0.12 : 0;
  }

  function drawMinimap() {
    const S = 172;
    const scale = S / (CITY.half * 2);
    const toMap = (x, z) => [(x + CITY.half) * scale, (z + CITY.half) * scale];
    mapCtx.fillStyle = '#20262c';
    mapCtx.fillRect(0, 0, S, S);
    mapCtx.strokeStyle = '#5a6068';
    mapCtx.lineWidth = 2;
    for (const c of city.lines) {
      const [x1, y1] = toMap(c, -CITY.half);
      const [x2, y2] = toMap(c, CITY.half);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x2, y2);
      mapCtx.stroke();
      const [x3, y3] = toMap(-CITY.half, c);
      const [x4, y4] = toMap(CITY.half, c);
      mapCtx.beginPath();
      mapCtx.moveTo(x3, y3);
      mapCtx.lineTo(x4, y4);
      mapCtx.stroke();
    }
    mapCtx.fillStyle = '#3a4149';
    for (const b of city.buildings) {
      const [x, y] = toMap(b.x0, b.z0);
      mapCtx.fillRect(x, y, (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }
    mapCtx.fillStyle = '#3f7a34';
    for (const park of city.parks) {
      const [x, y] = toMap(park.x0, park.z0);
      mapCtx.fillRect(x, y, (park.x1 - park.x0) * scale, (park.z1 - park.z0) * scale);
    }
    // Mission marker.
    if (state.missionIndex < MISSIONS.length) {
      const [mx, my] = toMap(state.missionMarker.x, state.missionMarker.z);
      mapCtx.fillStyle = '#ffd21f';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - 6);
      mapCtx.lineTo(mx + 6, my);
      mapCtx.lineTo(mx, my + 6);
      mapCtx.lineTo(mx - 6, my);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // Garage as a yellow square with a G.
    const [gx, gy] = toMap(state.garage.x, state.garage.z);
    mapCtx.fillStyle = '#ffd21f';
    mapCtx.fillRect(gx - 4, gy - 4, 8, 8);
    mapCtx.fillStyle = '#20262c';
    mapCtx.font = 'bold 8px sans-serif';
    mapCtx.fillText('G', gx - 2.5, gy + 3);
    // Police helicopter as a white dot.
    if (state.heli.active) {
      const [hx, hy] = toMap(state.heli.x, state.heli.z);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.beginPath();
      mapCtx.arc(hx, hy, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Police as red dots.
    mapCtx.fillStyle = '#ff2a2a';
    for (const c of state.cars) {
      if (!c.active || !c.isPolice) continue;
      const [x, y] = toMap(c.x, c.z);
      mapCtx.beginPath();
      mapCtx.arc(x, y, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Player as a triangle pointing where they face.
    const p = state.player;
    const [px, py] = toMap(p.x, p.z);
    mapCtx.fillStyle = '#3fa7ff';
    mapCtx.beginPath();
    mapCtx.moveTo(px + Math.sin(p.angle) * 7, py + Math.cos(p.angle) * 7);
    mapCtx.lineTo(px + Math.sin(p.angle + 2.5) * 5, py + Math.cos(p.angle + 2.5) * 5);
    mapCtx.lineTo(px + Math.sin(p.angle - 2.5) * 5, py + Math.cos(p.angle - 2.5) * 5);
    mapCtx.closePath();
    mapCtx.fill();
  }

  // Cosmetic radio stations; the label cycles, the audio never changes.
  const RADIO_STATIONS = ['SUNVALE FM 101.1', 'MARLA FM 88.5', 'BAY FM 94.7', 'NIGHT DRIVE 107.3'];

  function drawHud(screen, saveData) {
    const p = state.player;
    const hp = Math.max(0, Math.round(p.health));
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = hp > 50 ? '#43d14f' : hp > 25 ? '#f2c94c' : '#e5534b';
    moneyEl.textContent = `$${p.money}`;
    const s = world.stars();
    starsEl.textContent = '★'.repeat(s) + '☆'.repeat(5 - s);
    starsEl.style.opacity = s > 0 ? '1' : '0.25';
    crosshairEl.style.display = p.hasPistol && !p.inCar && screen === SCREEN_PLAY ? 'block' : 'none';
    if (state.bannerTimer > 0 && state.missionBanner) {
      bannerEl.style.display = 'block';
      bannerEl.textContent = state.missionBanner;
    } else {
      bannerEl.style.display = 'none';
    }
    const inPlay = screen === SCREEN_PLAY;
    if (inPlay) {
      if (state.missionIndex < MISSIONS.length) {
        const m = MISSIONS[state.missionIndex];
        const d = Math.round(Math.sqrt(
          (state.missionMarker.x - p.x) ** 2 + (state.missionMarker.z - p.z) ** 2,
        ));
        let hint = m.brief;
        if (m.kind === 'steal' && state.missionStage === 0) hint = 'Steal a car — walk up to one and press E.';
        if (m.kind === 'deliver' && state.missionStage === 0) hint = 'Pick up the package at the yellow marker.';
        if (m.kind === 'walk') hint = 'Reach the yellow marker on foot.';
        objectiveEl.innerHTML = `<b>${m.name} · $${m.reward}</b> — ${hint} (${d}m)`;
      } else {
        objectiveEl.innerHTML = '<b>Free roam</b> — all missions complete. Keep the city yours.';
      }
      // Mission tracker: every job, done / current / locked.
      let rows = '';
      for (let i = 0; i < MISSIONS.length; i += 1) {
        const m = MISSIONS[i];
        if (i < state.missionIndex) rows += `<div class="done">✓ ${i + 1}. ${m.name} · $${m.reward}</div>`;
        else if (i === state.missionIndex) rows += `<div class="current">▶ ${i + 1}. ${m.name} · $${m.reward}</div>`;
        else rows += `<div class="locked">· ${i + 1}. ${m.name} · $${m.reward}</div>`;
      }
      missionsEl.innerHTML = `<div class="head">MARLA'S JOBS ${state.missionIndex}/${MISSIONS.length}</div>${rows}<div class="garage">GARAGE — drive in to repair + repaint (+$50)</div>`;
      missionsEl.style.display = 'block';
      // Police dispatch ticker, driven by the wanted level and the response on scene.
      const responseUp = state.heli.active
        || state.roadblocks.some((rb) => rb.active);
      if (s === 0) dispatchEl.textContent = 'DISPATCH: All units clear — Sunvale is quiet.';
      else if (s === 1) dispatchEl.textContent = 'DISPATCH: 1 star — a unit is responding.';
      else if (s === 2) {
        dispatchEl.textContent = responseUp
          ? 'DISPATCH: 2 stars — AIR 1 still overhead, roadblocks up.'
          : 'DISPATCH: 2 stars — units responding, roadblocks possible.';
      } else if (s === 3) dispatchEl.textContent = 'DISPATCH: 3 stars — AIR 1 overhead, roadblocks up.';
      else dispatchEl.textContent = `DISPATCH: ${s} stars — AIR 1 spotlight on you, roadblocks up.`;
      dispatchEl.style.display = 'block';
      // Stats: cars stolen, deliveries made, missions done, respect earned.
      statsEl.innerHTML = `Cars stolen <b>${state.stats.stolen}</b> · Delivered <b>${state.stats.delivered}</b> · Jobs <b>${state.missionIndex}/${MISSIONS.length}</b> · Respect <b>${state.stats.respect}</b>`;
      statsEl.style.display = 'block';
      // Speed, only while driving.
      if (p.inCar) {
        speedEl.textContent = `${Math.round(Math.abs(p.inCar.speed) * 2.4)} mph`;
        speedEl.style.display = 'block';
      } else {
        speedEl.style.display = 'none';
      }
      // Radio label, cycling cosmetically.
      radioEl.textContent = `♪ ${RADIO_STATIONS[Math.floor(state.elapsed / 25) % RADIO_STATIONS.length]}`;
      radioEl.style.display = 'block';
    } else {
      objectiveEl.textContent = '';
      missionsEl.style.display = 'none';
      dispatchEl.style.display = 'none';
      statsEl.style.display = 'none';
      speedEl.style.display = 'none';
      radioEl.style.display = 'none';
    }
    drawMinimap();
  }

  function drawPanel(screen, saveData) {
    if (screen === SCREEN_PLAY) {
      panelEl.style.display = 'none';
      return;
    }
    panelEl.style.display = 'flex';
    if (screen === SCREEN_TITLE) {
      const done = saveData ? saveData.missionIndex : 0;
      panelEl.innerHTML = `<div class="card"><h1>SUNVALE 3D</h1>
        <h2>An open-world crime story in the spirit of GTA 6 — a city to take, on foot and by car.</h2>
        <p>Marla runs this town. She has ten jobs for you: steal cars, move packages, meet contacts, and break police dragnets. The cops answer with wanted stars — lose them or pay for them.</p>
        <p>WASD / arrows — move &amp; drive &nbsp;·&nbsp; E — steal / exit a car &nbsp;·&nbsp; Space — punch &nbsp;·&nbsp; Click — shoot &nbsp;·&nbsp; Shift — sprint &nbsp;·&nbsp; P — pause</p>
        <p class="fine">${done > 0 ? `Progress saved: ${done} mission${done > 1 ? 's' : ''} done.` : 'No Rockstar names, art, music or map — an original city.'}</p>
        <p class="prompt">Press Space or click to start</p></div>`;
    } else if (screen === SCREEN_PAUSED) {
      panelEl.innerHTML = `<div class="card"><h1>PAUSED</h1>
        <p>The city waits for you.</p>
        <p class="prompt">Press P to resume</p></div>`;
    } else {
      const busted = state.busted;
      panelEl.innerHTML = `<div class="card"><h1>${busted ? 'BUSTED' : 'WASTED'}</h1>
        <p>${busted ? 'The cops dragged you out of the game.' : 'Sunvale got the better of you.'}</p>
        <p>Money $${state.player.money} · Missions ${state.missionIndex} of ${MISSIONS.length} · Cars stolen ${state.stats.stolen}</p>
        <p class="prompt">Press Space or click to play again</p></div>`;
    }
  }

  /** The world point under the cursor, for aiming a shot. */
  function groundPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    if (dir.y >= -0.0001) return null;
    const t = -camera.position.y / dir.y;
    return { x: camera.position.x + dir.x * t, z: camera.position.z + dir.z * t };
  }

  // ---- Camera-following shadows ----
  // The shadow map only covers ~420 units, so it follows what the camera looks at,
  // snapped to 12-unit cells so the shadows do not shimmer as the focus moves.
  const sunDir = new THREE.Vector3(300, 500, 200).normalize();
  const shadowFocus = new THREE.Vector3();
  const SHADOW_CAST_RANGE = 260;
  function updateCityShadows() {
    shadowFocus.set(
      Math.round(camTarget.x / 12) * 12,
      0,
      Math.round(camTarget.z / 12) * 12,
    );
    sun.position.copy(shadowFocus).addScaledVector(sunDir, 620);
    sun.target.position.copy(shadowFocus);
    sun.target.updateMatrixWorld();
    const r2 = SHADOW_CAST_RANGE * SHADOW_CAST_RANGE;
    for (const b of buildingMeshes) {
      const dx = b.cx - shadowFocus.x;
      const dz = b.cz - shadowFocus.z;
      const near = dx * dx + dz * dz < r2;
      if (b.mesh.castShadow !== near) b.mesh.castShadow = near;
    }
  }

  /** Paint one frame: sync the 3D scene, move the camera, then the HUD and panels. */
  function draw(screen, saveData, dt) {
    const p = state.player;
    // Sync dynamic objects.
    for (let i = 0; i < state.cars.length; i += 1) syncCar(i);
    if (p.inCar) {
      playerPerson.group.visible = false;
    } else {
      syncPerson(playerPerson, p, true);
      playerPerson.group.rotation.y = p.angle;
    }
    for (let i = 0; i < state.peds.length; i += 1) syncPerson(pedPeople[i], state.peds[i], false);
    for (let i = 0; i < state.cops.length; i += 1) syncPerson(copPeople[i], state.cops[i], false);
    // Particles.
    for (let i = 0; i < state.particles.length; i += 1) {
      const pt = state.particles[i];
      if (pt.active) {
        pPos[i * 3] = pt.x;
        pPos[i * 3 + 1] = pt.y;
        pPos[i * 3 + 2] = pt.z;
        const c = new THREE.Color(pt.color);
        const fade = pt.life / pt.maxLife;
        pCol[i * 3] = c.r * fade;
        pCol[i * 3 + 1] = c.g * fade;
        pCol[i * 3 + 2] = c.b * fade;
      } else {
        pPos[i * 3 + 1] = -100;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    // Mission marker.
    const hasMission = state.missionIndex < MISSIONS.length;
    markerCol.visible = hasMission;
    markerGem.visible = hasMission;
    if (hasMission) {
      markerCol.position.set(state.missionMarker.x, 30, state.missionMarker.z);
      markerGem.position.set(
        state.missionMarker.x,
        12 + Math.sin(state.elapsed * 3) * 1.5,
        state.missionMarker.z,
      );
      markerGem.rotation.y += 0.03;
    }

    // Police helicopter: hover ahead of the player, rotors spinning, searchlight at 4+ stars.
    heli.visible = state.heli.active;
    if (state.heli.active) {
      heli.position.set(state.heli.x, state.heli.y, state.heli.z);
      heli.rotation.y = state.heli.angle;
      heliRotor.rotation.y = state.heli.rotor;
      heliTailRotor.rotation.x = state.heli.rotor * 2.5;
      heliSpot.visible = world.stars() >= 4;
    }

    // Roadblock barriers sit between each block's two police cars.
    for (let i = 0; i < state.roadblocks.length; i += 1) {
      const rb = state.roadblocks[i];
      const bar = barriers[i];
      bar.visible = rb.active;
      if (rb.active) {
        bar.position.set(rb.x, 0.9, rb.z);
        bar.rotation.y = rb.angle;
      }
    }

    // Camera: third person behind the player, or a slow orbit over the city on the title.
    if (screen === SCREEN_TITLE) {
      orbitAngle += (dt || 0.016) * 0.05;
      const r = 420;
      camPos.set(Math.sin(orbitAngle) * r, 210, Math.cos(orbitAngle) * r);
      camTarget.set(0, 0, 0);
    } else {
      const dist = p.inCar ? 17 : 12;
      const height = p.inCar ? 7.5 : 6;
      const back = p.angle + Math.PI;
      const wantX = p.x + Math.sin(back) * dist;
      const wantZ = p.z + Math.cos(back) * dist;
      camPos.x += (wantX - camPos.x) * 0.08;
      camPos.z += (wantZ - camPos.z) * 0.08;
      camPos.y += (height - camPos.y) * 0.08;
      camTarget.set(p.x, 2.5, p.z);
    }
    camera.position.copy(camPos);
    if (state.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * state.shake * 2.4;
      camera.position.y += (Math.random() - 0.5) * state.shake * 1.6;
      camera.position.z += (Math.random() - 0.5) * state.shake * 2.4;
    }
    camera.lookAt(camTarget);
    updateCityShadows();
    renderer.render(scene, camera);

    drawHud(screen, saveData);
    drawPanel(screen, saveData);
  }

  return { draw, groundPoint };
}
