// Sunvale 3D — renderer. Builds the three.js scene from the city data,
// draws the world state every frame, and owns the HUD DOM, the minimap,
// particles and screen shake. All three.js usage lives in this file.

import { WORLD, GARAGE, MISSIONS } from './config.js';

const THREE = globalThis.THREE;

function cssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function makeCarMesh(colorHex, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.2, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
  for (const [wx, wz] of [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    g.add(wheel);
  }
  if (isPolice) {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.5), barMat);
    bar.position.set(0, 1.6, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    red.position.set(-0.4, 1.72, -0.2);
    red.name = 'sirenRed';
    g.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    blue.position.set(0.4, 1.72, -0.2);
    blue.name = 'sirenBlue';
    g.add(blue);
  }
  return g;
}

function makePersonMesh(shirtHex) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtHex });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a077 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 1.95;
  head.castShadow = true;
  g.add(head);
  for (const lx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.7, 0.36), pants);
    leg.position.set(lx, 0.35, 0);
    g.add(leg);
  }
  return g;
}

function makeHeliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22303e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5.2), bodyMat);
  body.castShadow = true;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.6), bodyMat);
  tail.position.set(0, 0.3, -4.4);
  g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 1.1;
  rotor.name = 'rotor';
  g.add(rotor);
  const lamp = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 9, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  lamp.position.y = -5;
  lamp.rotation.x = Math.PI;
  lamp.name = 'spotCone';
  lamp.visible = false;
  g.add(lamp);
  const spot = new THREE.SpotLight(0xfff2b0, 0, 90, 0.35, 0.5, 1);
  spot.position.set(0, -1, 0);
  spot.name = 'spotLight';
  g.add(spot);
  g.add(spot.target);
  spot.target.position.set(0, -40, 0);
  return g;
}

export function createRenderer(container, world) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0x9fc8e8, 420, 1500);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 2200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdf9e, 1.25);
  sun.position.set(320, 420, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.far = 1400;
  scene.add(sun);

  // Ground and roads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.HALF * 2, WORLD.HALF * 2),
    new THREE.MeshLambertMaterial({ color: 0x8a9a6a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  for (const line of world.city.roads) {
    const roadX = new THREE.Mesh(new THREE.BoxGeometry(WORLD.ROAD_WIDTH, 0.1, WORLD.HALF * 2), roadMat);
    roadX.position.set(line, 0.05, 0);
    roadX.receiveShadow = true;
    scene.add(roadX);
    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(WORLD.HALF * 2, 0.1, WORLD.ROAD_WIDTH), roadMat);
    roadZ.position.set(0, 0.05, line);
    roadZ.receiveShadow = true;
    scene.add(roadZ);
    const walkX = new THREE.Mesh(new THREE.BoxGeometry(WORLD.ROAD_WIDTH + 12, 0.08, WORLD.HALF * 2), walkMat);
    walkX.position.set(line, 0.03, 0);
    walkX.receiveShadow = true;
    scene.add(walkX);
    const walkZ = new THREE.Mesh(new THREE.BoxGeometry(WORLD.HALF * 2, 0.08, WORLD.ROAD_WIDTH + 12), walkMat);
    walkZ.position.set(0, 0.03, line);
    walkZ.receiveShadow = true;
    scene.add(walkZ);
  }

  // Buildings.
  for (const b of world.city.buildings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      new THREE.MeshLambertMaterial({ color: b.color }),
    );
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w * 0.94, 1.2, b.d * 0.94),
      new THREE.MeshLambertMaterial({ color: b.roof }),
    );
    roof.position.set(b.x, b.h + 0.6, b.z);
    scene.add(roof);
    // Sunlit windows: a few bright quads on the sunny face.
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let i = 0; i < Math.min(4, Math.floor(b.h / 14)); i += 1) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), winMat);
      win.position.set(b.x - b.w / 4 + (i % 2) * (b.w / 2), 8 + i * 12, b.z + b.d / 2 + 0.06);
      scene.add(win);
    }
  }

  // Trees and lamps.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d7a3a });
  for (const t of world.city.trees) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * t.s, 0.5 * t.s, 2.4 * t.s, 8), trunkMat);
    trunk.position.set(t.x, 1.2 * t.s, t.z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2 * t.s, 5.5 * t.s, 8), leafMat);
    crown.position.set(t.x, (2.4 + 2.4) * t.s, t.z);
    crown.castShadow = true;
    scene.add(crown);
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  for (const l of world.city.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5, 6), lampMat);
    pole.position.set(l.x, 2.5, l.z);
    scene.add(pole);
  }

  // District plaza discs.
  for (const d of world.city.districts) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(10, 24),
      new THREE.MeshBasicMaterial({ color: 0xd9c27a, transparent: true, opacity: 0.55 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(d.x, 0.12, d.z);
    scene.add(disc);
  }

  // Garage bay: a green pad with a roof frame.
  const garagePad = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: 0x2e8b57 }),
  );
  garagePad.position.set(GARAGE.x, 0.15, GARAGE.z);
  garagePad.receiveShadow = true;
  scene.add(garagePad);

  // Mission marker beacon.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 30;
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(4, 6.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.25;
  scene.add(beaconRing);

  // Player, cars, pedestrians, police, helicopter.
  const playerMesh = makePersonMesh(0x2e6fd2);
  scene.add(playerMesh);
  const carMeshes = new Map();
  const pedMeshes = [];
  for (let i = 0; i < 40; i += 1) {
    const m = makePersonMesh(0x888888);
    m.visible = false;
    scene.add(m);
    pedMeshes.push(m);
  }
  const heliMesh = makeHeliMesh();
  heliMesh.visible = false;
  scene.add(heliMesh);

  // Particles: one Points cloud, recycled.
  const P_MAX = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_MAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xffd23c, size: 1.6, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  function burst(x, y, z, n, color) {
    pMat.color.setHex(color || 0xffd23c);
    for (let i = 0; i < n; i += 1) {
      if (particles.length >= P_MAX) particles.shift();
      particles.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 14,
        vy: Math.random() * 10 + 3,
        vz: (Math.random() - 0.5) * 14,
        life: 0.7 + Math.random() * 0.5,
      });
    }
  }

  // ---- HUD DOM ----
  const style = document.createElement('style');
  style.textContent = `
    #sunvale-hud { position:absolute; inset:0; pointer-events:none; font-family:-apple-system,"Segoe UI",Arial,sans-serif; color:#e8eff8; }
    #sunvale-hud .panel { background:rgba(10,18,28,.78); border:1px solid #25364a; border-radius:8px; padding:8px 12px; }
    #hud-topleft { position:absolute; top:14px; left:16px; }
    #hud-topleft .title { font-size:21px; font-weight:750; letter-spacing:1px; }
    #hud-topleft .sub { font-size:11px; color:#94a7bc; letter-spacing:2px; }
    #hud-radio { margin-top:4px; font-size:11px; color:#5cc8ff; letter-spacing:1px; }
    #hud-topright { position:absolute; top:14px; right:16px; text-align:right; }
    #hud-stars { font-size:22px; letter-spacing:3px; color:#fb7185; text-shadow:0 0 8px rgba(251,113,133,.6); }
    #hud-stars .off { color:#657b91; text-shadow:none; }
    #hud-money { font-size:15px; font-family:Consolas,monospace; margin-top:2px; }
    #hud-respect { font-size:12px; color:#94a7bc; }
    #hud-mission { position:absolute; left:16px; bottom:16px; min-width:300px; }
    #hud-mission .mhead { font-size:11px; letter-spacing:1.5px; color:#5cc8ff; font-weight:700; }
    #hud-mission .mname { font-size:16px; font-weight:700; margin-top:2px; }
    #hud-mission .mbrief { font-size:12px; color:#c0cbd9; margin-top:2px; max-width:420px; }
    #hud-mission .mreward { font-size:13px; font-family:Consolas,monospace; color:#34d399; margin-top:2px; }
    #hud-health { height:8px; background:#25364a; border-radius:4px; margin-top:6px; overflow:hidden; }
    #hud-health > div { height:100%; background:#34d399; }
    #hud-stats { position:absolute; left:16px; bottom:150px; font-size:11px; color:#94a7bc; font-family:Consolas,monospace; }
    #hud-ticker { position:absolute; left:50%; transform:translateX(-50%); bottom:18px; width:520px; text-align:center; font-size:12px; color:#e8eff8; }
    #hud-ticker div { background:rgba(10,18,28,.72); border-radius:5px; padding:3px 10px; margin-top:3px; display:inline-block; }
    #hud-banner { position:absolute; left:50%; top:22%; transform:translateX(-50%); font-size:26px; font-weight:750; letter-spacing:1px; color:#ffd23c; text-shadow:0 2px 12px rgba(0,0,0,.7); text-align:center; white-space:nowrap; }
    #hud-speed { position:absolute; right:16px; bottom:200px; font-size:13px; font-family:Consolas,monospace; color:#e8eff8; text-align:right; }
    #hud-minimap { position:absolute; right:16px; bottom:16px; border:1px solid #25364a; border-radius:8px; background:rgba(10,18,28,.85); }
    .sunvale-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(6,10,16,.82); color:#e8eff8; text-align:center; pointer-events:auto; }
    .sunvale-overlay h1 { font-size:44px; margin:0 0 8px; letter-spacing:3px; }
    .sunvale-overlay h2 { font-size:15px; font-weight:400; color:#94a7bc; margin:0 0 22px; letter-spacing:1px; }
    .sunvale-overlay .big { font-size:17px; color:#ffd23c; }
    .sunvale-overlay .keys { font-size:13px; color:#c0cbd9; line-height:1.9; margin-top:14px; }
    .sunvale-overlay button { margin-top:22px; font-size:16px; padding:10px 26px; border-radius:6px; border:1px solid #5cc8ff; background:#193246; color:#e8eff8; cursor:pointer; }
  `;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'sunvale-hud';
  hud.innerHTML = `
    <div id="hud-topleft" class="panel"><div class="title">SUNVALE 3D</div><div class="sub">A 3D OPEN-WORLD CRIME GAME</div><div id="hud-radio">SUNVALE FM 101.1</div></div>
    <div id="hud-topright" class="panel"><div id="hud-stars"></div><div id="hud-money">$0</div><div id="hud-respect">RESPECT 0</div></div>
    <div id="hud-mission" class="panel"><div class="mhead" id="hud-mhead">MARLA'S JOBS 0/20</div><div class="mname" id="hud-mname">—</div><div class="mbrief" id="hud-mbrief"></div><div class="mreward" id="hud-mreward"></div><div id="hud-health"><div style="width:100%"></div></div></div>
    <div id="hud-stats" class="panel"></div>
    <div id="hud-ticker"></div>
    <div id="hud-banner"></div>
    <div id="hud-speed"></div>
    <canvas id="hud-minimap" width="180" height="180"></canvas>
  `;
  container.appendChild(hud);
  const minimap = hud.querySelector('#hud-minimap');
  const mmCtx = minimap.getContext('2d');

  function overlay(id, html) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'sunvale-overlay';
      container.appendChild(el);
    }
    el.innerHTML = html;
    el.style.display = 'flex';
    return el;
  }
  function hideOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 60, 120);
  let lastBurstAt = 0;

  function drawMinimap() {
    const S = 180;
    const scale = S / (WORLD.HALF * 2);
    const px = (x) => (x + WORLD.HALF) * scale;
    const pz = (z) => (z + WORLD.HALF) * scale;
    mmCtx.clearRect(0, 0, S, S);
    mmCtx.fillStyle = '#0d1521';
    mmCtx.fillRect(0, 0, S, S);
    mmCtx.strokeStyle = '#25364a';
    mmCtx.lineWidth = 2;
    for (const line of world.city.roads) {
      mmCtx.beginPath();
      mmCtx.moveTo(px(line), 0);
      mmCtx.lineTo(px(line), S);
      mmCtx.stroke();
      mmCtx.beginPath();
      mmCtx.moveTo(0, pz(line));
      mmCtx.lineTo(S, pz(line));
      mmCtx.stroke();
    }
    mmCtx.fillStyle = '#2e8b57';
    mmCtx.fillRect(px(GARAGE.x) - 4, pz(GARAGE.z) - 4, 8, 8);
    const m = world.mission.marker;
    if (m) {
      mmCtx.fillStyle = '#ffd23c';
      mmCtx.beginPath();
      mmCtx.arc(px(m.x), pz(m.z), 5, 0, Math.PI * 2);
      mmCtx.fill();
    }
    mmCtx.fillStyle = '#5cc8ff';
    for (const pc of world.police) {
      mmCtx.beginPath();
      mmCtx.arc(px(pc.x), pz(pc.z), 2.5, 0, Math.PI * 2);
      mmCtx.fill();
    }
    const p = world.player;
    mmCtx.save();
    mmCtx.translate(px(p.x), pz(p.z));
    mmCtx.rotate(Math.atan2(Math.sin(p.angle), Math.cos(p.angle)) + Math.PI);
    mmCtx.fillStyle = '#ffffff';
    mmCtx.beginPath();
    mmCtx.moveTo(0, -7);
    mmCtx.lineTo(5, 6);
    mmCtx.lineTo(-5, 6);
    mmCtx.closePath();
    mmCtx.fill();
    mmCtx.restore();
  }

  function starsHtml(n) {
    let out = '';
    for (let i = 0; i < 5; i += 1) {
      out += i < n ? '★' : '<span class="off">★</span>';
    }
    return out;
  }

  return {
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    burst(x, y, z, n, color) {
      burst(x, y, z, n, color);
    },
    showTitle() {
      overlay('ov-title', `
        <h1>SUNVALE 3D</h1>
        <h2>A 3D open-world crime game — Marla runs this town. You drive for her.</h2>
        <div class="big">20 jobs. One crew. The Viper War.</div>
        <div class="keys">WASD — move / drive &nbsp;·&nbsp; E — enter / exit car &nbsp;·&nbsp; F — punch &nbsp;·&nbsp; G — pistol<br>SPACE — brake &nbsp;·&nbsp; SHIFT — run &nbsp;·&nbsp; P — pause</div>
        <button id="btn-start">START ENGINE</button>`);
      const btn = document.getElementById('btn-start');
      if (btn) btn.addEventListener('click', () => window.__sunvaleStart && window.__sunvaleStart());
    },
    showPause() {
      overlay('ov-pause', '<h1>PAUSED</h1><h2>Sunvale waits for no one — except right now.</h2><button id="btn-resume">RESUME</button>');
      const btn = document.getElementById('btn-resume');
      if (btn) btn.addEventListener('click', () => window.__sunvaleResume && window.__sunvaleResume());
    },
    showBusted() {
      overlay('ov-busted', '<h1>BUSTED</h1><h2>The cops got you. Marla will post bail.</h2><button id="btn-retry">TRY AGAIN</button>');
      const btn = document.getElementById('btn-retry');
      if (btn) btn.addEventListener('click', () => window.__sunvaleRestart && window.__sunvaleRestart());
    },
    showComplete() {
      overlay('ov-done', `<h1>SUNVALE IS OURS</h1><h2>All 20 jobs done — $${world.cash.toLocaleString()} earned, respect ${world.respect}.</h2><div class="big">The Vipers are finished.</div><button id="btn-again">PLAY AGAIN</button>`);
      const btn = document.getElementById('btn-again');
      if (btn) btn.addEventListener('click', () => window.__sunvaleRestart && window.__sunvaleRestart());
    },
    hideOverlays() {
      hideOverlay('ov-title');
      hideOverlay('ov-pause');
      hideOverlay('ov-busted');
      hideOverlay('ov-done');
    },
    update(dt) {
      const p = world.player;
      const t = world.time;

      // Camera: third person behind the player, smoothed, with shake.
      const back = 15;
      const up = 7.5;
      const fx = Math.sin(p.angle);
      const fz = Math.cos(p.angle);
      camTarget.set(p.x + fx * 8, 2, p.z + fz * 8);
      const wantX = p.x - fx * back;
      const wantZ = p.z - fz * back;
      camPos.x += (wantX - camPos.x) * Math.min(1, dt * 5);
      camPos.z += (wantZ - camPos.z) * Math.min(1, dt * 5);
      camPos.y += (up - camPos.y) * Math.min(1, dt * 5);
      const sh = world.shake;
      camera.position.set(
        camPos.x + (Math.random() - 0.5) * sh * 1.6,
        camPos.y + (Math.random() - 0.5) * sh * 1.2,
        camPos.z + (Math.random() - 0.5) * sh * 1.6,
      );
      camera.lookAt(camTarget);
      sun.position.set(p.x + 320, 420, p.z + 180);
      sun.target.position.set(p.x, 0, p.z);
      sun.target.updateMatrixWorld();

      // Player mesh.
      playerMesh.visible = p.onFoot;
      playerMesh.position.set(p.x, 0, p.z);
      playerMesh.rotation.y = p.angle;
      const bob = p.onFoot && Math.abs(p.speed) > 0.5 ? Math.sin(t * 11) * 0.08 : 0;
      playerMesh.position.y = bob;

      // Cars.
      const seen = new Set();
      for (const c of world.cars) {
        seen.add(c.id);
        let mesh = carMeshes.get(c.id);
        if (!mesh) {
          mesh = makeCarMesh(c.color, c.kind === 'police');
          scene.add(mesh);
          carMeshes.set(c.id, mesh);
        }
        mesh.visible = true;
        mesh.position.set(c.x, 0, c.z);
        mesh.rotation.y = c.angle;
        if (c.kind === 'player' && c.id === p.carId) {
          mesh.position.y = 0;
        }
        if (c.color !== undefined && mesh.userData.color !== c.color) {
          mesh.userData.color = c.color;
          mesh.children[0].material = new THREE.MeshLambertMaterial({ color: c.color });
        }
      }
      for (const pc of world.police) {
        seen.add(pc.id);
        let mesh = carMeshes.get(pc.id);
        if (!mesh) {
          mesh = makeCarMesh(pc.color, true);
          scene.add(mesh);
          carMeshes.set(pc.id, mesh);
        }
        mesh.visible = true;
        mesh.position.set(pc.x, 0, pc.z);
        mesh.rotation.y = pc.angle;
        const blink = Math.floor(t * 6) % 2 === 0;
        const red = mesh.getObjectByName('sirenRed');
        const blue = mesh.getObjectByName('sirenBlue');
        if (red) red.visible = blink;
        if (blue) blue.visible = !blink;
      }
      for (const [id, mesh] of carMeshes) {
        if (!seen.has(id)) mesh.visible = false;
      }

      // Pedestrians.
      world.peds.forEach((ped, i) => {
        const m = pedMeshes[i];
        if (!m) return;
        m.visible = true;
        m.position.set(ped.x, ped.down > 0 ? -0.7 : 0, ped.z);
        m.rotation.y = ped.angle;
        if (ped.down > 0) m.rotation.x = Math.PI / 2;
        else m.rotation.x = 0;
        m.children[0].material = new THREE.MeshLambertMaterial({ color: ped.hue });
      });

      // Helicopter.
      const h = world.heli;
      heliMesh.visible = h.active && h.fade > 0.02;
      if (heliMesh.visible) {
        heliMesh.position.set(h.x, h.height || 58, h.z);
        heliMesh.rotation.y = h.angle;
        const rotor = heliMesh.getObjectByName('rotor');
        if (rotor) rotor.rotation.y += dt * 22;
        const cone = heliMesh.getObjectByName('spotCone');
        const spot = heliMesh.getObjectByName('spotLight');
        if (cone) cone.visible = h.spotlight;
        if (spot) spot.intensity = h.spotlight ? 2.4 : 0;
        heliMesh.scale.setScalar(h.fade);
      }

      // Roadblocks: reuse police car meshes parked across the road.
      // (Drawn as dark barriers so they read at a glance.)
      // Mission beacon.
      const marker = world.mission.marker;
      if (marker && world.started && !world.allDone) {
        beacon.visible = true;
        beacon.position.set(marker.x, 30, marker.z);
        beaconRing.visible = true;
        beaconRing.position.set(marker.x, 0.25, marker.z);
        const pulse = 1 + Math.sin(t * 4) * 0.15;
        beaconRing.scale.set(pulse, pulse, 1);
        beacon.material.opacity = 0.28 + Math.sin(t * 4) * 0.08;
      } else {
        beacon.visible = false;
        beaconRing.visible = false;
      }

      // Particles.
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const pt = particles[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        pt.vy -= 22 * dt;
        if (pt.y < 0.1) {
          pt.y = 0.1;
          pt.vy *= -0.4;
        }
      }
      for (let i = 0; i < P_MAX; i += 1) {
        const pt = particles[i];
        if (pt) {
          pPos[i * 3] = pt.x;
          pPos[i * 3 + 1] = pt.y;
          pPos[i * 3 + 2] = pt.z;
        } else {
          pPos[i * 3 + 1] = -100;
        }
      }
      pGeo.attributes.position.needsUpdate = true;

      // HUD text.
      hud.querySelector('#hud-stars').innerHTML = starsHtml(world.wanted);
      hud.querySelector('#hud-money').textContent = `$${world.cash.toLocaleString()}`;
      hud.querySelector('#hud-respect').textContent = `RESPECT ${world.respect}`;
      const mission = world.mission;
      const mDef = mission.index < MISSIONS.length ? MISSIONS[mission.index] : null;
      const mName = document.getElementById('hud-mname');
      const mBrief = document.getElementById('hud-mbrief');
      const mReward = document.getElementById('hud-mreward');
      const mHead = document.getElementById('hud-mhead');
      if (world.allDone) {
        mHead.textContent = "MARLA'S JOBS 20/20 — DONE";
        mName.textContent = 'Sunvale is ours';
        mBrief.textContent = 'All 20 jobs complete. The Vipers are finished.';
        mReward.textContent = '';
      } else if (mDef) {
        mHead.textContent = `MARLA'S JOBS ${mission.index}/20`;
        mName.textContent = `${mission.index + 1}. ${mDef.name}`;
        mBrief.textContent = mDef.brief;
        mReward.textContent = `$${mDef.reward}  ·  ${mDef.kind.toUpperCase()}`;
      }
      const hp = world.player.onFoot ? world.player.health : 100;
      hud.querySelector('#hud-health > div').style.width = `${Math.max(0, hp)}%`;
      const car = world.cars.find((c) => c.id === world.player.carId);
      if (car) {
        hud.querySelector('#hud-health > div').style.width = `${Math.max(0, car.health)}%`;
      }
      hud.querySelector('#hud-stats').textContent =
        `CARS ${world.stats.stolen} · DELIVERED ${world.stats.delivered} · JOBS ${world.stats.jobsDone}`;
      hud.querySelector('#hud-speed').textContent = world.player.onFoot
        ? ''
        : `${Math.round(Math.abs(world.player.speed) * 2.2)} mph`;
      const tickerEl = hud.querySelector('#hud-ticker');
      tickerEl.innerHTML = world.ticker.slice(-3).map((l) => `<div>${l.text}</div>`).join('');
      const bannerEl = hud.querySelector('#hud-banner');
      const b = world.banners[world.banners.length - 1];
      bannerEl.textContent = b ? b.text : '';
      drawMinimap();

      // Pickup sparkle when a mission stage flips.
      if (world.mission.pickedUp && t - lastBurstAt > 1.2) {
        lastBurstAt = t;
        burst(p.x, 2, p.z, 12, 0xffd23c);
      }

      renderer.render(scene, camera);
    },
  };
}
