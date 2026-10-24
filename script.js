/**
 * LABORATORIO DE SISTEMAS CINÉTICOS Y TELEMETRÍA
 * Mateo Salcedo - Motor Gráfico de Doble Capa sin Dependencias
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. ESTADO GLOBAL DEL SISTEMA
  // ==========================================================================
  const state = {
    xrayActive: false,
    currentTopology: 'torus', // 'torus' | 'hypercube' | 'sphere'
    particleDensity: 1280,
    fps: 60,
    frametime: 16.6,
    vertexCount: 0,
    mouse: { x: 0, y: 0, targetX: 0, targetY: 0 },
    rotation: { x: 0.2, y: 0.4, z: 0 },
    cameraDist: 480
  };

  // ==========================================================================
  // 2. REFERENCIAS DOM
  // ==========================================================================
  const canvas = document.getElementById('kinetic-canvas');
  const ctx = canvas.getContext('2d');

  const domFps = document.getElementById('val-fps');
  const domFrametime = document.getElementById('val-frametime');
  const domVertices = document.getElementById('val-vertices');
  const domNodes = document.getElementById('val-nodes');
  const domBarFps = document.getElementById('bar-fps');
  const domBarFt = document.getElementById('bar-frametime');
  const domCanvasDim = document.getElementById('canvas-dim');
  const domXrayStatus = document.getElementById('xray-status-text');

  const domMouseX = document.getElementById('mouse-x');
  const domMouseY = document.getElementById('mouse-y');
  const domMatrixAngle = document.getElementById('matrix-angle');
  const domGeoLabel = document.getElementById('geo-label');
  const domDensityIndicator = document.getElementById('density-indicator');
  const domHwDpr = document.getElementById('hw-dpr');
  const domHwMotion = document.getElementById('hw-motion');

  const btnXray = document.getElementById('btn-xray');
  const btnGeo = document.getElementById('btn-geometry');
  const benchBtns = document.querySelectorAll('.bench-btn');
  const contactForm = document.getElementById('contact-form');
  const formFeedback = document.getElementById('form-feedback');

  // ==========================================================================
  // 3. GENERADORES DE GEOMETRÍA 3D ANALÍTICA
  // ==========================================================================

  class GeometryEngine {
    static createTorus(R = 140, r = 55, segU = 32, segV = 20) {
      const vertices = [];
      const edges = [];

      for (let i = 0; i < segU; i++) {
        const u = (i / segU) * Math.PI * 2;
        for (let j = 0; j < segV; j++) {
          const v = (j / segV) * Math.PI * 2;
          const x = (R + r * Math.cos(v)) * Math.cos(u);
          const y = (R + r * Math.cos(v)) * Math.sin(u);
          const z = r * Math.sin(v);
          vertices.push({ x, y, z, origX: x, origY: y, origZ: z });

          const current = i * segV + j;
          const nextV = i * segV + ((j + 1) % segV);
          const nextU = ((i + 1) % segU) * segV + j;

          edges.push([current, nextV]);
          edges.push([current, nextU]);
        }
      }
      return { vertices, edges };
    }

    static createHypercube(size = 110) {
      // Proyección isométrica tridimensional de un tesseract rotatorio (16 vértices)
      const vertices = [];
      const edges = [];
      const s = size;
      const s2 = size * 0.55;

      // Cubo exterior
      for (let i = 0; i < 8; i++) {
        vertices.push({
          x: (i & 1 ? 1 : -1) * s,
          y: (i & 2 ? 1 : -1) * s,
          z: (i & 4 ? 1 : -1) * s
        });
      }
      // Cubo interior
      for (let i = 0; i < 8; i++) {
        vertices.push({
          x: (i & 1 ? 1 : -1) * s2,
          y: (i & 2 ? 1 : -1) * s2,
          z: (i & 4 ? 1 : -1) * s2
        });
      }

      // Conexiones de cubos y aristas transversales
      const addCubeEdges = (offset) => {
        const pairs = [
          [0,1],[1,3],[3,2],[2,0],
          [4,5],[5,7],[7,6],[6,4],
          [0,4],[1,5],[2,6],[3,7]
        ];
        pairs.forEach(([a, b]) => edges.push([a + offset, b + offset]));
      };

      addCubeEdges(0);
      addCubeEdges(8);
      for (let i = 0; i < 8; i++) {
        edges.push([i, i + 8]);
      }

      // Vértices cinemáticos de alta densidad interna
      for (let i = 0; i < 200; i++) {
        const t = (i / 200) * Math.PI * 4;
        vertices.push({
          x: Math.sin(t) * s * 0.8,
          y: Math.cos(t * 1.5) * s * 0.8,
          z: Math.sin(t * 0.5) * s * 0.8
        });
      }

      return { vertices, edges };
    }

    static createSphere(radius = 150, rings = 22, slices = 28) {
      const vertices = [];
      const edges = [];

      for (let i = 0; i <= rings; i++) {
        const theta = (i * Math.PI) / rings;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let j = 0; j < slices; j++) {
          const phi = (j * 2 * Math.PI) / slices;
          const x = radius * sinTheta * Math.cos(phi);
          const y = radius * cosTheta;
          const z = radius * sinTheta * Math.sin(phi);
          vertices.push({ x, y, z });

          const curr = i * slices + j;
          const nextSlice = i * slices + ((j + 1) % slices);
          edges.push([curr, nextSlice]);

          if (i < rings) {
            const nextRing = (i + 1) * slices + j;
            edges.push([curr, nextRing]);
          }
        }
      }
      return { vertices, edges };
    }
  }

  let mesh = GeometryEngine.createTorus();
  state.vertexCount = mesh.vertices.length;

  // ==========================================================================
  // 4. TRANSFORMACIONES 3D Y MATRICES ANALÍTICAS
  // ==========================================================================

  function rotateX(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x,
      y: point.y * cos - point.z * sin,
      z: point.y * sin + point.z * cos
    };
  }

  function rotateY(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x * cos + point.z * sin,
      y: point.y,
      z: -point.x * sin + point.z * cos
    };
  }

  function rotateZ(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
      z: point.z
    };
  }

  function project(p, width, height) {
    const fov = state.cameraDist;
    const zPos = p.z + fov;
    if (zPos <= 1) return null;
    const factor = fov / zPos;
    return {
      x: p.x * factor + width * 0.5,
      y: p.y * factor + height * 0.5,
      depth: p.z,
      scale: factor
    };
  }

  // ==========================================================================
  // 5. MANEJO DE REDIMENSIONAMIENTO Y RESOLUCIÓN
  // ==========================================================================
  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    ctx.scale(dpr, dpr);

    if (domCanvasDim) {
      domCanvasDim.textContent = `${w}x${h} [${dpr}x]`;
    }
    if (domHwDpr) {
      domHwDpr.textContent = `${dpr.toFixed(1)}x`;
    }
  }

  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();

  // ==========================================================================
  // 6. RENDER LOOP CINÉTICO (CAPA 0)
  // ==========================================================================
  let lastTimestamp = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;

  function render(now) {
    const dt = now - lastTimestamp;
    lastTimestamp = now;
    state.frametime = dt;

    // Medición de FPS precisa con ventana de 250ms
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 250) {
      state.fps = (frameCount * 1000) / fpsTimer;
      frameCount = 0;
      fpsTimer = 0;
      updateTelemetryUI();
    }

    // Interpolación suave de cursor de ratón hacia coordenadas blanco
    state.mouse.x += (state.mouse.targetX - state.mouse.x) * 0.05;
    state.mouse.y += (state.mouse.targetY - state.mouse.y) * 0.05;

    // Rotación autónoma combinada con influencia del mouse
    state.rotation.y += 0.005 + state.mouse.x * 0.00008;
    state.rotation.x += 0.003 + state.mouse.y * 0.00008;
    state.rotation.z += 0.001;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Limpieza de fotograma
    ctx.clearRect(0, 0, width, height);

    // Desplazamiento reactivo de vértices (ondulación cuántica)
    const timeSec = now * 0.0015;
    const projectedVerts = new Array(mesh.vertices.length);

    for (let i = 0; i < mesh.vertices.length; i++) {
      let v = mesh.vertices[i];
      let dynamicPoint = { x: v.x, y: v.y, z: v.z };

      // Perturbación sinusoidal cinemática si no es cubo estricto
      if (state.currentTopology !== 'hypercube') {
        const wave = Math.sin(timeSec + v.x * 0.02) * Math.cos(timeSec + v.y * 0.02);
        dynamicPoint.x += wave * 4;
        dynamicPoint.y += wave * 4;
      }

      // Aplicar matrices de rotación en 3 ejes
      let r = rotateX(dynamicPoint, state.rotation.x);
      r = rotateY(r, state.rotation.y);
      r = rotateZ(r, state.rotation.z);

      // Desplazar ligeramente hacia la derecha en escritorio para componer con texto
      if (width > 980) {
        r.x += 120;
      }

      projectedVerts[i] = project(r, width, height);
    }

    // Dibujar aristas de la malla
    const isXray = state.xrayActive;
    ctx.lineWidth = isXray ? 0.75 : 0.65;

    for (let k = 0; k < mesh.edges.length; k++) {
      const [idxA, idxB] = mesh.edges[k];
      const pA = projectedVerts[idxA];
      const pB = projectedVerts[idxB];

      if (!pA || !pB) continue;

      // Atenuación por distancia (Fog de profundidad Z)
      const avgZ = (pA.depth + pB.depth) * 0.5;
      const alpha = Math.max(0.04, Math.min(0.65, (avgZ + 160) / 320));

      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);

      if (isXray) {
        // En rayos X: azul/cian con alta saturación analítica
        ctx.strokeStyle = `rgba(0, 255, 200, ${alpha * 1.2})`;
      } else {
        // Modo normal: esmeralda técnico degradado a grafito
        ctx.strokeStyle = `rgba(0, 255, 170, ${alpha * 0.7})`;
      }
      ctx.stroke();
    }

    // Dibujar vértices e índices en modo Rayos X
    const vertStep = isXray ? 2 : 4;
    for (let i = 0; i < projectedVerts.length; i += vertStep) {
      const p = projectedVerts[i];
      if (!p) continue;

      const pointRadius = isXray ? 1.5 * p.scale : 1.0 * p.scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, pointRadius), 0, Math.PI * 2);
      ctx.fillStyle = isXray ? '#00ffff' : 'rgba(0, 255, 170, 0.7)';
      ctx.fill();

      // En rayos X, mostrar anotaciones de vector cada N nodos
      if (isXray && i % 40 === 0) {
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(0, 255, 200, 0.5)';
        ctx.fillText(`N${i}`, p.x + 4, p.y - 2);
      }
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  // ==========================================================================
  // 7. TELEMETRÍA Y CONTROLES DE INTERFAZ
  // ==========================================================================

  function updateTelemetryUI() {
    if (domFps) {
      domFps.textContent = state.fps.toFixed(1);
      const fpsPct = Math.min(100, (state.fps / 60) * 100);
      domBarFps.style.width = fpsPct + '%';
      domBarFps.style.background = state.fps > 48 ? 'var(--accent-emerald)' : 'var(--accent-amber)';
    }

    if (domFrametime) {
      domFrametime.textContent = `${state.frametime.toFixed(1)} ms`;
      const ftPct = Math.min(100, (state.frametime / 33.3) * 100);
      domBarFt.style.width = ftPct + '%';
    }

    if (domVertices) {
      domVertices.textContent = mesh.vertices.length.toLocaleString('es-ES');
    }

    if (domNodes) {
      domNodes.textContent = document.getElementsByTagName('*').length;
    }

    if (domMatrixAngle) {
      const deg = Math.round(((state.rotation.y % (Math.PI * 2)) * 180) / Math.PI);
      domMatrixAngle.textContent = `ROT_Y ${deg}°`;
    }
  }

  // Captura de coordenadas del puntero para telemetría activa
  window.addEventListener('pointermove', (e) => {
    const normX = (e.clientX / window.innerWidth) * 2 - 1;
    const normY = (e.clientY / window.innerHeight) * 2 - 1;

    state.mouse.targetX = normX * 180;
    state.mouse.targetY = normY * 180;

    if (domMouseX) domMouseX.textContent = normX.toFixed(3);
    if (domMouseY) domMouseY.textContent = normY.toFixed(3);
  }, { passive: true });

  // Conmutador Rayos X
  function toggleXray() {
    state.xrayActive = !state.xrayActive;
    document.body.classList.toggle('xray-active', state.xrayActive);
    btnXray.setAttribute('aria-pressed', state.xrayActive ? 'true' : 'false');

    if (domXrayStatus) {
      domXrayStatus.textContent = state.xrayActive ? 'RENDER: RADIOGRÁFICO' : 'RENDER: SÓLIDO';
      domXrayStatus.style.color = state.xrayActive ? 'var(--accent-emerald)' : 'var(--accent-cyan)';
    }
  }

  btnXray.addEventListener('click', toggleXray);

  // Atajo de teclado 'X' para alternar rayos X (ergonomía de laboratorio)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        toggleXray();
      }
    }
  });

  // Conmutador de Topología Cinética
  const topologies = ['torus', 'hypercube', 'sphere'];
  const topoLabels = { torus: 'TOROIDE', hypercube: 'HIPERCUBO', sphere: 'ESFERA' };

  btnGeo.addEventListener('click', () => {
    const nextIdx = (topologies.indexOf(state.currentTopology) + 1) % topologies.length;
    state.currentTopology = topologies[nextIdx];
    domGeoLabel.textContent = topoLabels[state.currentTopology];
    rebuildMesh();
  });

  function rebuildMesh() {
    if (state.currentTopology === 'torus') {
      const segU = state.particleDensity > 2000 ? 44 : state.particleDensity < 600 ? 20 : 32;
      const segV = state.particleDensity > 2000 ? 28 : state.particleDensity < 600 ? 14 : 20;
      mesh = GeometryEngine.createTorus(140, 55, segU, segV);
    } else if (state.currentTopology === 'hypercube') {
      mesh = GeometryEngine.createHypercube(110);
    } else {
      const rings = state.particleDensity > 2000 ? 30 : state.particleDensity < 600 ? 14 : 22;
      const slices = state.particleDensity > 2000 ? 38 : state.particleDensity < 600 ? 18 : 28;
      mesh = GeometryEngine.createSphere(150, rings, slices);
    }
    state.vertexCount = mesh.vertices.length;
    if (domVertices) domVertices.textContent = state.vertexCount.toLocaleString('es-ES');
  }

  // Selector de densidad de carga poligonal (Benchmark)
  benchBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      benchBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const nodes = parseInt(btn.getAttribute('data-nodes'), 10);
      state.particleDensity = nodes;
      domDensityIndicator.textContent = `${nodes} NODOS`;
      rebuildMesh();
    });
  });

  // Detección de preferencia de accesibilidad
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (domHwMotion) domHwMotion.textContent = 'REDUCIDO (ACCESIBLE)';
  }

  // ==========================================================================
  // 8. FORMULARIO TRANSMISIÓN TERMINAL
  // ==========================================================================
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('comm-name').value.trim();
      const email = document.getElementById('comm-email').value.trim();
      const msg = document.getElementById('comm-msg').value.trim();

      if (!name || !email || !msg) {
        showFeedback('ERR_0x42: CAMPOS INCOMPLETOS. COMPLETE TODAS LAS ENTRADAS.', 'error');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showFeedback('ERR_0x19: ESTRUCTURA DE CORREO NO VÁLIDA.', 'error');
        return;
      }

      showFeedback('CIFRANDO PAQUETE... TRANSMITIENDO...', 'success');
      const submitBtn = contactForm.querySelector('.terminal-submit');
      submitBtn.disabled = true;

      setTimeout(() => {
        showFeedback('TRANSMISIÓN VERIFICADA. CÓDIGO_ACK: 200 OK. SALCEDO NOTIFICADO.', 'success');
        contactForm.reset();
        submitBtn.disabled = false;
      }, 1200);
    });
  }

  function showFeedback(text, type) {
    if (!formFeedback) return;
    formFeedback.textContent = text;
    formFeedback.className = `form-feedback ${type}`;
  }

  // Ejecución inicial de telemetría de nodos
  updateTelemetryUI();
})();


/* ==========================================================================
   MEJORAS 3D DINÁMICAS: PERSPECTIVA, TILT, SOMBRAS NEÓN Y CANVAS INTERACTIVO
   ========================================================================== */
(function() {
  function init3DEnhancements() {
    // 1. Inyección de estilos de perspectiva 3D, sombras neón y variables dinámicas
    const dynamicStyle = document.createElement('style');
    dynamicStyle.id = 'dynamic-3d-styles';
    dynamicStyle.textContent = `
      :root {
        --neon-cyan: #00f0ff;
        --neon-emerald: #10b981;
        --neon-amber: #f59e0b;
        --glow-spread: 25px;
      }
      .tilt-card-3d {
        transform-style: preserve-3d;
        perspective: 1200px;
        transition: transform 0.15s ease-out, box-shadow 0.25s ease-out, border-color 0.25s ease;
        will-change: transform, box-shadow;
        position: relative;
      }
      .tilt-card-3d::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: radial-gradient(circle 180px at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(0, 240, 255, 0.12), rgba(16, 185, 129, 0.05), transparent 80%);
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 2;
      }
      .tilt-card-3d:hover::after {
        opacity: 1;
      }
      .tilt-card-3d > * {
        transform: translateZ(28px);
        transition: transform 0.2s ease-out;
      }
      .neon-glow-cyan {
        box-shadow: 0 10px 30px -10px rgba(0, 240, 255, 0.3), 0 0 20px 2px rgba(0, 240, 255, 0.15) !important;
      }
      .neon-glow-emerald {
        box-shadow: 0 10px 30px -10px rgba(16, 185, 129, 0.3), 0 0 20px 2px rgba(16, 185, 129, 0.15) !important;
      }
      .neon-glow-amber {
        box-shadow: 0 10px 30px -10px rgba(245, 158, 11, 0.3), 0 0 20px 2px rgba(245, 158, 11, 0.15) !important;
      }
      #interactive-3d-bg {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 0;
        opacity: 0.65;
      }
    `;
    document.head.appendChild(dynamicStyle);

    // 2. Efecto 3D Tilt y sombras dinámicas al mover el ratón sobre tarjetas y paneles
    const cardSelectors = [
      '.card',
      '.project-card',
      '.skill-card',
      '.stat-card',
      '.experience-card',
      '.terminal-window',
      '.glass-panel',
      '.hero-card',
      'article',
      '.bento-item'
    ];
    const cards = document.querySelectorAll(cardSelectors.join(','));
    const colors = ['neon-glow-cyan', 'neon-glow-emerald', 'neon-glow-amber'];

    cards.forEach((card, index) => {
      card.classList.add('tilt-card-3d');
      const glowClass = colors[index % colors.length];

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;

        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.025, 1.025, 1.025)`;
        card.classList.add(glowClass);
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        card.classList.remove(glowClass);
      });
    });

    // 3. Canvas 3D de constelación y geometría interactiva con acentos cian, esmeralda y ámbar
    if (!document.getElementById('interactive-3d-bg')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'interactive-3d-bg';
      document.body.prepend(canvas);
      const ctx = canvas.getContext('2d');
      let width = (canvas.width = window.innerWidth);
      let height = (canvas.height = window.innerHeight);
      let mouse = { x: width / 2, y: height / 2, active: false };

      window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      });

      window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
      });

      const particles = [];
      const numParticles = Math.min(Math.floor((width * height) / 18000), 75);
      const palette = ['#00f0ff', '#10b981', '#f59e0b'];

      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random() * 2 + 0.5,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          size: Math.random() * 2.2 + 1,
          color: palette[i % palette.length]
        });
      }

      function renderCanvas() {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx * p.z;
          p.y += p.vy * p.z;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          if (mouse.active) {
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 140) {
              p.x -= (dx / dist) * 1.5;
              p.y -= (dy / dist) * 1.5;
            }
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.z * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.fill();
          ctx.shadowBlur = 0;

          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
            if (dist < 110) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(0, 240, 255, ${((1 - dist / 110) * 0.18).toFixed(3)})`;
              ctx.lineWidth = 0.75;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(renderCanvas);
      }
      renderCanvas();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init3DEnhancements);
  } else {
    init3DEnhancements();
  }
})();
