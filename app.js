/*
 * Solar System Sim — planetary motion in different reference frames.
 *
 * Structure
 *   1. Configuration
 *   2. Model     — orbital mathematics (pure functions, no DOM). Also loadable in Node for testing.
 *   3. App       — state, rendering, interaction (browser only)
 *
 * Units: distance in AU, time in days since the start configuration.
 */
(function () {
  'use strict';

  // ===================================================================
  // 1. Configuration
  // ===================================================================
  const CONFIG = {
    // Initial orbital phases: mean longitudes (degrees) at simulation day 0.
    // Defaults approximate the mean longitudes at J2000.0 (1 Jan 2000).
    // Edit these values to start from a different planetary arrangement.
    initialLongitudesDeg: {
      mercury: 252.25,
      venus: 181.98,
      earth: 100.46,
      mars: 355.45,
      jupiter: 34.40,
      saturn: 49.94,
      uranus: 313.23,
      neptune: 304.88,
      pluto: 238.93,
    },
    speeds: [1, 2, 4, 10, 50, 100, 500, 1000], // simulated days per real second
    defaultSpeed: 10,
    trailYears: [1, 2, 5, 10, 30, 100, 250],
    defaultTrailYears: 5,
    stepDays: 10, // step forward / backward buttons
    timelineYears: 30, // initial range of the timeline slider (extends automatically)
    samplesPerOrbit: 300, // trail resolution relative to the fastest orbit involved
    maxSamplesPerTrail: 20000,
  };

  const DAYS_PER_YEAR = 365.25;
  const TAU = Math.PI * 2;

  const BODY_DEFS = [
    { id: 'sun', name: 'Sun', a: 0, period: Infinity, color: '#ffd166', radius: 8 },
    { id: 'mercury', name: 'Mercury', a: 0.387, period: 87.97, color: '#aab6c4', radius: 3.6 },
    { id: 'venus', name: 'Venus', a: 0.723, period: 224.70, color: '#7fd8be', radius: 4.8 },
    { id: 'earth', name: 'Earth', a: 1.0, period: 365.256, color: '#4ea8ff', radius: 5 },
    { id: 'mars', name: 'Mars', a: 1.524, period: 686.98, color: '#ff6b5b', radius: 4.3 },
    { id: 'jupiter', name: 'Jupiter', a: 5.203, period: 4332.59, color: '#f4a259', radius: 7 },
    { id: 'saturn', name: 'Saturn', a: 9.537, period: 10759.22, color: '#c39bff', radius: 6.2, rings: true },
    { id: 'uranus', name: 'Uranus', a: 19.191, period: 30688.5, color: '#9eeaf2', radius: 5.6 },
    { id: 'neptune', name: 'Neptune', a: 30.069, period: 60182, color: '#6f7dff', radius: 5.5 },
    // Pluto is the only body drawn on an ellipse (e ≈ 0.25). varpi = longitude of perihelion (degrees).
    { id: 'pluto', name: 'Pluto', a: 39.482, period: 90560, color: '#d8b48f', radius: 2.8, e: 0.2488, varpiDeg: 224.07 },
  ];

  // ===================================================================
  // 2. Model
  // ===================================================================
  function createModel(longitudesDeg) {
    const bodies = BODY_DEFS.map((d, idx) => Object.assign({}, d, {
      idx,
      L0: ((longitudesDeg[d.id] || 0) * Math.PI) / 180,
      n: Number.isFinite(d.period) ? TAU / d.period : 0, // mean motion (rad/day)
      e: d.e || 0,
      varpi: ((d.varpiDeg || 0) * Math.PI) / 180,
    }));
    const byId = {};
    bodies.forEach((b) => { byId[b.id] = b; });

    // Eccentric anomaly E from mean anomaly M (Kepler's equation E - e sin E = M), Newton's method.
    function solveKepler(M, e) {
      M = ((M % TAU) + TAU) % TAU;
      let E = e < 0.8 ? M : Math.PI;
      for (let i = 0; i < 20; i++) {
        const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= d;
        if (Math.abs(d) < 1e-13) break;
      }
      return E;
    }

    // Heliocentric position from ABSOLUTE time t (days). Coplanar orbits:
    // circular for e = 0, Keplerian ellipse (Sun at one focus) otherwise.
    function worldPosition(body, t, out) {
      out = out || [0, 0];
      if (body.a === 0) { out[0] = 0; out[1] = 0; return out; }
      const L = body.L0 + body.n * t; // mean longitude
      if (body.e === 0) {
        out[0] = body.a * Math.cos(L);
        out[1] = body.a * Math.sin(L);
        return out;
      }
      const e = body.e;
      const E = solveKepler(L - body.varpi, e);
      const xp = body.a * (Math.cos(E) - e); // perihelion along +x'
      const yp = body.a * Math.sqrt(1 - e * e) * Math.sin(E);
      const c = Math.cos(body.varpi); const s = Math.sin(body.varpi);
      out[0] = xp * c - yp * s;
      out[1] = xp * s + yp * c;
      return out;
    }

    // relativePosition = worldPosition(body, t) - worldPosition(reference, t)
    const tmpA = [0, 0];
    const tmpB = [0, 0];
    function relativePosition(body, ref, t, out) {
      out = out || [0, 0];
      worldPosition(body, t, tmpA);
      worldPosition(ref, t, tmpB);
      out[0] = tmpA[0] - tmpB[0];
      out[1] = tmpA[1] - tmpB[1];
      return out;
    }

    // ---- Cached world positions on fixed time grids --------------------
    // Grid level L has spacing 2^L days. Positions are cached in chunks so that
    // trails are not recomputed from trigonometry every frame. Because the grid is
    // fixed in absolute time, trails never become disconnected when scrubbing or
    // changing speed: they are always a pure function of the time window.
    const CHUNK = 512;
    const MAX_CHUNKS = 1500;
    const cache = new Map();

    function chunk(body, level, ci) {
      const key = body.idx + ':' + level + ':' + ci;
      let c = cache.get(key);
      if (c) return c;
      if (cache.size >= MAX_CHUNKS) cache.clear();
      const h = Math.pow(2, level);
      c = new Float64Array(CHUNK * 2);
      if (body.a !== 0) {
        const k0 = ci * CHUNK;
        const p = [0, 0];
        for (let j = 0; j < CHUNK; j++) {
          worldPosition(body, (k0 + j) * h, p);
          c[2 * j] = p[0];
          c[2 * j + 1] = p[1];
        }
      }
      cache.set(key, c);
      return c;
    }

    function sampleLevel(body, ref, duration) {
      let fastest = Math.min(body.period, ref.period);
      if (!Number.isFinite(fastest)) fastest = byId.earth.period;
      let h = fastest / CONFIG.samplesPerOrbit;
      h = Math.max(h, duration / CONFIG.maxSamplesPerTrail);
      const level = Math.floor(Math.log2(h));
      return Math.max(-4, Math.min(6, level));
    }

    function createBuffer() {
      return { x: new Float64Array(0), y: new Float64Array(0), t: new Float64Array(0), n: 0 };
    }
    function ensure(buf, count) {
      if (buf.x.length >= count) return;
      const size = Math.max(count, buf.x.length * 2, 1024);
      buf.x = new Float64Array(size);
      buf.y = new Float64Array(size);
      buf.t = new Float64Array(size);
    }

    // Samples the relative trajectory of `body` seen from `ref` over [t0, t1].
    // Endpoints are exact, so the trail always ends precisely at the body's current position.
    const tmpP = [0, 0];
    function sampleTrail(body, ref, t0, t1, buf) {
      buf = buf || createBuffer();
      const level = sampleLevel(body, ref, t1 - t0);
      const h = Math.pow(2, level);
      const kStart = Math.floor(t0 / h) + 1;
      const kEnd = Math.ceil(t1 / h) - 1;
      ensure(buf, Math.max(0, kEnd - kStart + 1) + 2);
      let n = 0;
      relativePosition(body, ref, t0, tmpP);
      buf.x[n] = tmpP[0]; buf.y[n] = tmpP[1]; buf.t[n] = t0; n++;
      let k = kStart;
      while (k <= kEnd) {
        const ci = Math.floor(k / CHUNK);
        const cb = chunk(body, level, ci);
        const cr = chunk(ref, level, ci);
        const last = Math.min(kEnd, ci * CHUNK + CHUNK - 1);
        for (; k <= last; k++) {
          const j = (k - ci * CHUNK) * 2;
          buf.x[n] = cb[j] - cr[j];
          buf.y[n] = cb[j + 1] - cr[j + 1];
          buf.t[n] = k * h;
          n++;
        }
      }
      relativePosition(body, ref, t1, tmpP);
      buf.x[n] = tmpP[0]; buf.y[n] = tmpP[1]; buf.t[n] = t1; n++;
      buf.n = n;
      return buf;
    }

    // ---- Historical interpretation: deferent + epicycle (seen from Earth) ----
    // Derived from the same circular-orbit positions:
    //   centre + arm = relativePosition(planet, Earth, t)  (exactly)
    // Only defined for circular orbits (Pluto's elliptical orbit is excluded in the UI).
    function epicycle(body, t) {
      const earth = byId.earth;
      if (body.a < earth.a) {
        // Inferior planet: epicycle centre = apparent Sun, epicycle radius = planet's orbit.
        const e = worldPosition(earth, t);
        return { cx: -e[0], cy: -e[1], deferentRadius: earth.a, epicycleRadius: body.a };
      }
      // Superior planet: epicycle centre = planet's heliocentric position, epicycle radius = Earth's orbit.
      const p = worldPosition(body, t);
      return { cx: p[0], cy: p[1], deferentRadius: body.a, epicycleRadius: earth.a };
    }

    // ---- Self tests (run in the browser console on load, and from Node) ----
    function selfTest() {
      const results = [];
      const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
      const EPS = 1e-9;
      const times = [-250, 0, 1, 17.3, 100, 365.256, 1000, 5000, 12345.6];

      // 1. Each reference body is fixed at the origin of its own frame.
      bodies.forEach((ref) => {
        let max = 0;
        times.forEach((t) => {
          const p = relativePosition(ref, ref, t);
          max = Math.max(max, Math.hypot(p[0], p[1]));
        });
        check(ref.name + ' fixed at centre of ' + ref.name + '-centred frame', max < EPS, 'max offset ' + max);
      });

      // 2. Frames are mutually consistent: rel(A, C) = rel(A, B) + rel(B, C).
      let maxT = 0;
      times.forEach((t) => bodies.forEach((A) => bodies.forEach((B) => bodies.forEach((C) => {
        const ac = relativePosition(A, C, t);
        const ab = relativePosition(A, B, t);
        const bc = relativePosition(B, C, t);
        maxT = Math.max(maxT, Math.abs(ac[0] - ab[0] - bc[0]), Math.abs(ac[1] - ab[1] - bc[1]));
      }))));
      check('All reference frames mutually consistent', maxT < 1e-12, 'max error ' + maxT);

      // 3. Sun seen from Earth: circle of radius 1 AU repeating every sidereal year.
      const sun = byId.sun;
      const earth = byId.earth;
      let rErr = 0;
      times.forEach((t) => {
        const s = relativePosition(sun, earth, t);
        rErr = Math.max(rErr, Math.abs(Math.hypot(s[0], s[1]) - 1));
      });
      const s0 = relativePosition(sun, earth, 123.4);
      const s1 = relativePosition(sun, earth, 123.4 + earth.period);
      check('Sun traces a 1 AU annual circle in Earth-centred frame',
        rErr < EPS && Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) < 1e-9, 'radius error ' + rErr);

      // 4. Retrograde episodes seen from Earth (count prograde -> retrograde reversals).
      function retrogradeEpisodes(body, years) {
        let prev = null; let prevRate = null; let count = 0;
        for (let t = 0; t <= years * DAYS_PER_YEAR; t += 0.5) {
          const p = relativePosition(body, earth, t);
          const lon = Math.atan2(p[1], p[0]);
          if (prev !== null) {
            let d = lon - prev;
            if (d > Math.PI) d -= TAU;
            if (d < -Math.PI) d += TAU;
            if (prevRate !== null && prevRate >= 0 && d < 0) count++;
            prevRate = d;
          }
          prev = lon;
        }
        return count;
      }
      const marsLoops = retrogradeEpisodes(byId.mars, 15);
      // Mars synodic period ≈ 780 days → ≈ 7 retrograde episodes in 15 years.
      check('Mars shows retrograde loops relative to Earth', marsLoops >= 6 && marsLoops <= 8, marsLoops + ' episodes in 15 years');
      const sunLoops = retrogradeEpisodes(sun, 15);
      check('Sun never moves retrograde in Earth-centred frame', sunLoops === 0, sunLoops + ' episodes');

      // 5. Cached trail samples equal the analytic positions.
      const buf = sampleTrail(byId.mars, earth, -37.3, 1234.5);
      let cErr = 0;
      for (let i = 0; i < buf.n; i++) {
        const p = relativePosition(byId.mars, earth, buf.t[i]);
        cErr = Math.max(cErr, Math.abs(p[0] - buf.x[i]), Math.abs(p[1] - buf.y[i]));
      }
      check('Cached trail samples match analytic positions', cErr < 1e-9, 'max error ' + cErr + ' over ' + buf.n + ' samples');
      const endP = relativePosition(byId.mars, earth, 1234.5);
      check('Trail ends exactly at current position',
        buf.x[buf.n - 1] === endP[0] && buf.y[buf.n - 1] === endP[1]);

      // 6. Epicycle decomposition reproduces Earth-centred positions exactly.
      let eErr = 0;
      ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].forEach((id) => {
        const b = byId[id];
        times.forEach((t) => {
          const e = epicycle(b, t);
          const p = relativePosition(b, earth, t);
          const armLen = Math.hypot(p[0] - e.cx, p[1] - e.cy);
          const centreLen = Math.hypot(e.cx, e.cy);
          eErr = Math.max(eErr, Math.abs(armLen - e.epicycleRadius), Math.abs(centreLen - e.deferentRadius));
        });
      });
      check('Deferent + epicycle reproduce Earth-centred positions', eErr < 1e-9, 'max error ' + eErr);

      // 7. Pluto: elliptical orbit with the Sun at a focus.
      const pluto = byId.pluto;
      let rMin = Infinity; let rMax = 0;
      for (let t = 0; t < pluto.period; t += 5) {
        const p = worldPosition(pluto, t);
        const r = Math.hypot(p[0], p[1]);
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      }
      const q = pluto.a * (1 - pluto.e); const Q = pluto.a * (1 + pluto.e);
      check('Pluto perihelion / aphelion distances match a(1 ∓ e)',
        Math.abs(rMin - q) < 0.01 && Math.abs(rMax - Q) < 0.01,
        'r ' + rMin.toFixed(3) + '–' + rMax.toFixed(3) + ' AU (expected ' + q.toFixed(3) + '–' + Q.toFixed(3) + ')');
      const pA = worldPosition(pluto, 321.5);
      const pB = worldPosition(pluto, 321.5 + pluto.period);
      check('Pluto orbit closes after one period', Math.hypot(pA[0] - pB[0], pA[1] - pB[1]) < 1e-9);
      // Kepler's second law: equal areas in equal times.
      const sweep = (t0, dt) => {
        let area = 0; const steps = 2000; const a = [0, 0]; const b = [0, 0];
        for (let i = 0; i < steps; i++) {
          worldPosition(pluto, t0 + (dt * i) / steps, a);
          worldPosition(pluto, t0 + (dt * (i + 1)) / steps, b);
          area += (a[0] * b[1] - a[1] * b[0]) / 2;
        }
        return area;
      };
      const A1 = sweep(0, 3000); const A2 = sweep(40000, 3000);
      check('Pluto sweeps equal areas in equal times', Math.abs(A1 - A2) / A1 < 1e-4, A1.toFixed(4) + ' vs ' + A2.toFixed(4));

      return results;
    }

    return {
      bodies, byId, worldPosition, relativePosition, sampleTrail, sampleLevel,
      createBuffer, epicycle, selfTest,
    };
  }

  const model = createModel(CONFIG.initialLongitudesDeg);

  // Node / non-browser: export the model for testing and stop here.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { model, CONFIG, DAYS_PER_YEAR };
    return;
  }

  // ===================================================================
  // 3. App
  // ===================================================================
  const $ = (id) => document.getElementById(id);
  const FRAME_ORDER = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  // Epicycles are only defined for circular orbits, so Pluto is not included.
  const PLANETS_FOR_EPICYCLE = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const presetOf = (ids) => {
    const o = {};
    BODY_DEFS.forEach((d) => { o[d.id] = ids.indexOf(d.id) >= 0; });
    return o;
  };
  const PRESETS = {
    inner: presetOf(['sun', 'mercury', 'venus', 'earth', 'mars']),
    outer: presetOf(['sun', 'earth', 'jupiter', 'saturn']),
    far: presetOf(['sun', 'earth', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']),
    all: presetOf(BODY_DEFS.map((d) => d.id)),
  };

  const state = {
    t: 0,
    playing: false,
    speed: CONFIG.defaultSpeed,
    frame: 'earth',
    compare: false,
    showTrails: true,
    fullTrajectories: true,
    fade: true,
    trailYears: CONFIG.defaultTrailYears,
    visible: Object.assign({}, PRESETS.inner),
    preset: 'inner',
    epicycle: 'off',
    lastEpicycle: 'mars',
    presenting: false,
    presentLabels: false, // in presentation (viewing) mode, text is hidden unless toggled with L
    trailOrigin: 0, // start of growing trails (used when full trajectories are off)
    timelineMax: CONFIG.timelineYears * DAYS_PER_YEAR,
  };

  function frameName(id) { return model.byId[id].name + '-centred'; }

  // ---- Views & cameras -------------------------------------------------
  function makeView(frameFn) {
    return { frame: frameFn, cam: { scale: 100, cx: 0, cy: 0, auto: true }, rect: { x: 0, y: 0, w: 1, h: 1 } };
  }
  const views = {
    single: makeView(() => state.frame),
    left: makeView(() => 'earth'),
    right: makeView(() => 'sun'),
  };
  function activeViews() { return state.compare ? [views.left, views.right] : [views.single]; }

  // ---- Canvas setup ----------------------------------------------------
  const wrap = $('canvas-wrap');
  const bg = $('bg');
  const scene = $('scene');
  const bgCtx = bg.getContext('2d');
  const ctx = scene.getContext('2d');
  let W = 1; let H = 1; let dpr = 1;
  let dirty = true;
  const buf = model.createBuffer();

  function layoutViews() {
    views.single.rect = { x: 0, y: 0, w: W, h: H };
    const half = Math.floor(W / 2);
    views.left.rect = { x: 0, y: 0, w: half, h: H };
    views.right.rect = { x: half, y: 0, w: W - half, h: H };
  }

  function resize() {
    const r = wrap.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = window.devicePixelRatio || 1;
    [bg, scene].forEach((c) => {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    });
    layoutViews();
    drawStarfield();
    Object.values(views).forEach((v) => { if (v.cam.auto) resetCamera(v); });
    updateViewLabels();
    dirty = true;
  }

  // Deterministic starfield, drawn once per resize.
  function drawStarfield() {
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = bgCtx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0c1733');
    g.addColorStop(0.55, '#060c1e');
    g.addColorStop(1, '#02040b');
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, W, H);
    let seed = 1234567;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const count = Math.round((W * H) / 2200);
    for (let i = 0; i < count; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const m = rnd();
      const r = 0.25 + Math.pow(m, 3) * 1.1;
      const a = 0.15 + Math.pow(rnd(), 2) * 0.55;
      const tint = rnd();
      bgCtx.fillStyle = tint < 0.15 ? `rgba(180,200,255,${a})` : tint > 0.92 ? `rgba(255,225,190,${a})` : `rgba(235,240,255,${a})`;
      bgCtx.beginPath();
      bgCtx.arc(x, y, r, 0, TAU);
      bgCtx.fill();
    }
  }

  // ---- Time ------------------------------------------------------------
  function trailWindow() {
    const D = state.trailYears * DAYS_PER_YEAR;
    const t1 = state.t;
    let t0 = t1 - D;
    if (!state.fullTrajectories) t0 = Math.max(t0, state.trailOrigin);
    return [t0, t1];
  }

  function setTime(t) {
    t = Math.max(0, t);
    state.t = t;
    if (t < state.trailOrigin) state.trailOrigin = t;
    if (t > state.timelineMax) {
      state.timelineMax = Math.ceil(t / DAYS_PER_YEAR + 5) * DAYS_PER_YEAR;
      ui.timeline.max = String(Math.round(state.timelineMax));
    }
    updateTimeUI();
    dirty = true;
  }

  // ---- Camera ----------------------------------------------------------
  // Extent of visible trajectories (full window, independent of growing-trail state).
  function visibleExtent(view) {
    const ref = model.byId[view.frame()];
    const D = state.trailYears * DAYS_PER_YEAR;
    let minX = 0; let maxX = 0; let minY = 0; let maxY = 0; let maxR = 0;
    model.bodies.forEach((b) => {
      if (b === ref || !state.visible[b.id]) return;
      model.sampleTrail(b, ref, state.t - D, state.t, buf);
      for (let i = 0; i < buf.n; i++) {
        const x = buf.x[i]; const y = buf.y[i];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const r = x * x + y * y;
        if (r > maxR) maxR = r;
      }
    });
    return { minX, maxX, minY, maxY, maxR: Math.sqrt(maxR) || 1 };
  }

  // Reset: reference body at centre, zoom so all visible trajectories fit.
  function resetCamera(view) {
    const e = visibleExtent(view);
    const r = view.rect;
    view.cam.cx = 0;
    view.cam.cy = 0;
    view.cam.scale = (Math.min(r.w, r.h) * 0.43) / e.maxR;
    view.cam.auto = true;
  }

  // Fit: tightest framing of the visible trajectories (may shift the centre slightly).
  function fitCamera(view) {
    const e = visibleExtent(view);
    const r = view.rect;
    const bw = Math.max(e.maxX - e.minX, 1e-3);
    const bh = Math.max(e.maxY - e.minY, 1e-3);
    view.cam.cx = (e.minX + e.maxX) / 2;
    view.cam.cy = (e.minY + e.maxY) / 2;
    view.cam.scale = Math.min((r.w * 0.86) / bw, (r.h * 0.82) / bh);
    view.cam.auto = false;
  }

  function zoomAt(view, factor, px, py) {
    const r = view.rect; const cam = view.cam;
    const rcx = r.x + r.w / 2; const rcy = r.y + r.h / 2;
    const wx = cam.cx + (px - rcx) / cam.scale;
    const wy = cam.cy - (py - rcy) / cam.scale;
    cam.scale = Math.min(20000, Math.max(0.5, cam.scale * factor));
    cam.cx = wx - (px - rcx) / cam.scale;
    cam.cy = wy + (py - rcy) / cam.scale;
    cam.auto = false;
    dirty = true;
  }

  function zoomCentre(factor) {
    activeViews().forEach((v) => zoomAt(v, factor, v.rect.x + v.rect.w / 2, v.rect.y + v.rect.h / 2));
  }

  function viewAt(px) {
    const vs = activeViews();
    for (const v of vs) if (px >= v.rect.x && px < v.rect.x + v.rect.w) return v;
    return vs[vs.length - 1];
  }

  // ---- Rendering -------------------------------------------------------
  function labelScale() { return state.presenting ? 1.4 : 1; }
  // Viewing mode keeps the canvas free of text unless the presenter asks for labels (L).
  function textOn() { return !state.presenting || state.presentLabels; }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    activeViews().forEach(drawView);
    if (state.compare) {
      const x = views.right.rect.x + 0.5;
      ctx.strokeStyle = 'rgba(150,180,230,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  function drawView(view) {
    const ref = model.byId[view.frame()];
    const r = view.rect; const cam = view.cam; const s = cam.scale;
    const ox = r.x + r.w / 2 - cam.cx * s;
    const oy = r.y + r.h / 2 + cam.cy * s;

    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();

    if (state.showTrails) {
      const [t0, t1] = trailWindow();
      if (t1 > t0) {
        // With a single-planet epicycle overlay, dim the other trails so the construction stands out.
        const focus = ref.id === 'earth' && state.epicycle !== 'off' && state.epicycle !== 'all' ? state.epicycle : null;
        model.bodies.forEach((b) => {
          if (b !== ref && state.visible[b.id]) drawTrail(b, ref, t0, t1, ox, oy, s, focus && b.id !== focus ? 0.25 : 1);
        });
      }
    }

    if (state.epicycle !== 'off' && ref.id === 'earth') drawEpicycles(ox, oy, s);

    // Bodies: Sun first (its glow sits underneath), reference body on top.
    const p = [0, 0];
    model.bodies.forEach((b) => {
      if (b === ref || !state.visible[b.id]) return;
      model.relativePosition(b, ref, state.t, p);
      drawBody(b, ox + p[0] * s, oy - p[1] * s, false);
    });
    drawBody(ref, ox, oy, true);

    if (textOn()) drawScaleBar(r, s);
    ctx.restore();
  }

  function drawTrail(body, ref, t0, t1, ox, oy, s, opacity) {
    const b = model.sampleTrail(body, ref, t0, t1, buf);
    const n = b.n;
    if (n < 2) return;
    const D = state.trailYears * DAYS_PER_YEAR;
    const ls = labelScale();
    const buckets = state.fade ? 24 : 1;
    ctx.strokeStyle = body.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let i = 0;
    for (let k = 0; k < buckets && i < n - 1; k++) {
      // Bucket by age (time), so fading is anchored to "how long ago", not to sample index.
      const tEnd = k === buckets - 1 ? Infinity : t1 - D * (1 - (k + 1) / buckets);
      let j = i;
      while (j < n - 1 && b.t[j + 1] <= tEnd) j++;
      if (j > i) {
        const alpha = (state.fade ? 0.07 + 0.93 * Math.pow((k + 1) / buckets, 1.5) : 0.9) * opacity;
        ctx.beginPath();
        ctx.moveTo(ox + b.x[i] * s, oy - b.y[i] * s);
        for (let q = i + 1; q <= j; q++) ctx.lineTo(ox + b.x[q] * s, oy - b.y[q] * s);
        ctx.globalAlpha = alpha * 0.14; // soft glow
        ctx.lineWidth = 5 * ls;
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.7 * ls;
        ctx.stroke();
      }
      i = j;
    }
    ctx.globalAlpha = 1;
  }

  function drawBody(body, x, y, isRef) {
    const ls = labelScale();
    const rad = body.radius * (state.presenting ? 1.25 : 1);
    if (body.id === 'sun') {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.6);
      g.addColorStop(0, 'rgba(255,240,200,1)');
      g.addColorStop(0.22, 'rgba(255,209,102,0.95)');
      g.addColorStop(0.5, 'rgba(255,170,60,0.25)');
      g.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad * 3.6, 0, TAU); ctx.fill();
    } else {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = body.color;
      ctx.beginPath(); ctx.arc(x, y, rad * 2.1, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.4, 0, TAU); ctx.fill();
      if (body.rings) {
        ctx.strokeStyle = body.color;
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(x, y, rad * 2, rad * 0.65, -0.35, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (isRef) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(x, y, rad + 9 * ls, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Label
    if (!textOn()) return;
    const fs = 13 * ls;
    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    const text = body.name;
    const lx = x + rad + 7 * ls;
    const ly = y - rad - 3 * ls;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(3,6,15,0.85)';
    ctx.strokeText(text, lx, ly);
    ctx.fillStyle = isRef ? '#ffffff' : body.color;
    ctx.fillText(text, lx, ly);
    if (isRef) {
      const w = ctx.measureText(text + ' ').width;
      ctx.font = `500 ${fs * 0.8}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.strokeText('(fixed)', lx + w, ly);
      ctx.fillStyle = 'rgba(220,230,250,0.7)';
      ctx.fillText('(fixed)', lx + w, ly);
    }
  }

  function drawEpicycles(ox, oy, s) {
    const ids = state.epicycle === 'all'
      ? PLANETS_FOR_EPICYCLE.filter((id) => state.visible[id])
      : [state.epicycle];
    const single = ids.length === 1;
    const ls = labelScale();
    const earth = model.byId.earth;
    const p = [0, 0];
    ids.forEach((id) => {
      const b = model.byId[id];
      const e = model.epicycle(b, state.t);
      model.relativePosition(b, earth, state.t, p);
      const cx = ox + e.cx * s; const cy = oy - e.cy * s;
      const px = ox + p[0] * s; const py = oy - p[1] * s;
      ctx.strokeStyle = b.color;
      ctx.fillStyle = b.color;
      // Deferent (around Earth)
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.2 * ls;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(ox, oy, e.deferentRadius * s, 0, TAU); ctx.stroke();
      // Earth → epicycle centre
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.setLineDash([]);
      // Epicycle
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.6 * ls;
      ctx.beginPath(); ctx.arc(cx, cy, e.epicycleRadius * s, 0, TAU); ctx.stroke();
      // Arm: epicycle centre → planet
      ctx.lineWidth = 2 * ls;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 3 * ls, 0, TAU); ctx.fill();

      if (single && textOn()) {
        const fs = 12 * ls;
        ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(3,6,15,0.85)';
        const a = Math.PI * 0.25;
        const dx = ox + Math.cos(a) * e.deferentRadius * s + 6;
        const dy = oy - Math.sin(a) * e.deferentRadius * s - 6;
        ctx.strokeText('Deferent', dx, dy);
        ctx.fillText('Deferent', dx, dy);
        const ex = cx + e.epicycleRadius * s * 0.72 + 6;
        const ey = cy - e.epicycleRadius * s * 0.72 - 6;
        ctx.strokeText('Epicycle', ex, ey);
        ctx.fillText('Epicycle', ex, ey);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawScaleBar(r, s) {
    const nice = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
    let L = nice[0];
    for (const v of nice) { if (v * s <= 160) L = v; }
    const len = L * s;
    const ls = labelScale();
    const x1 = r.x + r.w - 24;
    const x0 = x1 - len;
    const y = r.y + r.h - 22;
    ctx.strokeStyle = 'rgba(200,215,240,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x1, y - 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,215,240,0.75)';
    ctx.font = `500 ${11 * ls}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(L + ' AU', (x0 + x1) / 2, y - 7);
    ctx.textAlign = 'left';
  }

  // ---- UI --------------------------------------------------------------
  const ui = {
    frameSelector: $('frame-selector'),
    speedSelector: $('speed-selector'),
    trailYears: $('trail-years'),
    presets: $('presets'),
    bodyToggles: $('body-toggles'),
    timeline: $('timeline'),
    tDays: $('t-days'),
    tYears: $('t-years'),
    play: $('btn-play'),
    compare: $('btn-compare'),
    present: $('btn-present'),
    optTrails: $('opt-trails'),
    optFull: $('opt-full'),
    optFade: $('opt-fade'),
    epicycleSelect: $('epicycle-select'),
    epicycleCaption: $('epicycle-caption'),
    viewLabels: $('view-labels'),
    info: $('info'),
    toast: $('toast'),
  };

  function buildSegmented(container, items, onPick) {
    container.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg';
      b.dataset.value = String(it.value);
      b.innerHTML = it.html;
      if (it.title) b.title = it.title;
      b.addEventListener('click', () => onPick(it.value));
      container.appendChild(b);
    });
  }
  function markSegmented(container, value) {
    Array.from(container.children).forEach((b) => {
      const on = b.dataset.value === String(value);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function updateTimeUI() {
    ui.timeline.value = String(state.t);
    ui.timeline.style.setProperty('--p', (100 * state.t / state.timelineMax).toFixed(3) + '%');
    ui.tDays.textContent = 'Day ' + Math.floor(state.t).toLocaleString('en-US');
    ui.tYears.textContent = (state.t / DAYS_PER_YEAR).toFixed(2) + ' years';
  }

  function updateViewLabels() {
    ui.viewLabels.innerHTML = '';
    activeViews().forEach((v) => {
      const id = v.frame();
      const el = document.createElement('div');
      el.className = 'view-label';
      el.style.left = (v.rect.x + 18) + 'px';
      el.innerHTML = `<span class="dot" style="--c:${model.byId[id].color}"></span>`
        + `<span class="view-title">${frameName(id)}</span>`
        + `<span class="view-sub">${model.byId[id].name} held fixed at the centre</span>`;
      ui.viewLabels.appendChild(el);
    });
    const showCaption = state.epicycle !== 'off' && (state.compare || state.frame === 'earth');
    ui.epicycleCaption.hidden = !showCaption;
    if (showCaption) {
      const r = state.compare ? views.left.rect : views.single.rect;
      ui.epicycleCaption.style.left = (r.x + r.w / 2) + 'px';
      ui.epicycleCaption.style.maxWidth = Math.max(260, r.w - 60) + 'px';
    }
  }

  function syncUI() {
    markSegmented(ui.frameSelector, state.compare ? '' : state.frame);
    markSegmented(ui.speedSelector, state.speed);
    markSegmented(ui.trailYears, state.trailYears);
    markSegmented(ui.presets, state.preset);
    Array.from(ui.bodyToggles.children).forEach((b) => {
      const on = !!state.visible[b.dataset.id];
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    ui.play.classList.toggle('playing', state.playing);
    ui.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    ui.compare.classList.toggle('active', state.compare);
    ui.present.classList.toggle('active', state.presenting);
    ui.optTrails.checked = state.showTrails;
    ui.optFull.checked = state.fullTrajectories;
    ui.optFade.checked = state.fade;
    ui.epicycleSelect.value = state.epicycle;
    document.body.classList.toggle('comparing', state.compare);
    updateViewLabels();
    updateTimeUI();
    dirty = true;
  }

  let toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2600);
  }

  // ---- Actions -----------------------------------------------------------
  function setFrame(id) {
    state.compare = false;
    state.frame = id;
    if (id !== 'earth' && state.epicycle !== 'off') state.epicycle = 'off';
    layoutViews();
    resetCamera(views.single);
    syncUI();
  }

  function setCompare(on) {
    state.compare = on;
    layoutViews();
    activeViews().forEach(resetCamera);
    syncUI();
  }

  function togglePlay() { state.playing = !state.playing; syncUI(); }

  function resetSimulation() {
    state.t = 0;
    state.trailOrigin = 0;
    syncUI();
  }

  function step(days) { setTime(state.t + days); }

  function setPreset(name) {
    state.preset = name;
    state.visible = Object.assign({}, PRESETS[name]);
    syncUI(); // camera is left as it is
  }

  function toggleBody(id) {
    state.visible[id] = !state.visible[id];
    state.preset = '';
    syncUI();
  }

  function setEpicycle(value) {
    state.epicycle = value;
    if (value !== 'off') {
      state.lastEpicycle = value;
      if (value !== 'all' && !state.visible[value]) {
        state.visible[value] = true;
        state.preset = '';
      }
      // Camera is left as it is, unless the overlay forces a switch to the Earth-centred frame.
      if (!state.compare && state.frame !== 'earth') {
        state.frame = 'earth';
        resetCamera(views.single);
      }
    }
    syncUI();
  }

  function setFullTrajectories(on) {
    state.fullTrajectories = on;
    if (!on) state.trailOrigin = state.t; // start tracing fresh from now
    syncUI();
  }

  function requestFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) { toast('Fullscreen is not available — use your browser\'s fullscreen (F11 / ⌃⌘F).'); return; }
    try {
      const p = fn.call(el);
      if (p && p.then) {
        p.then(
          () => { enteredFullscreen = true; },
          () => toast('Fullscreen was blocked — use your browser\'s fullscreen (F11 / ⌃⌘F).'),
        );
      } else {
        enteredFullscreen = true;
      }
    } catch (err) {
      toast('Fullscreen was blocked — use your browser\'s fullscreen (F11 / ⌃⌘F).');
    }
  }
  function exitFullscreen() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsEl) return;
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) { try { const p = fn.call(document); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ } }
  }

  function setPresenting(on) {
    state.presenting = on;
    document.body.classList.toggle('presenting', on);
    document.body.classList.toggle('show-text', on && state.presentLabels);
    setReveal(false, false, false);
    if (on) { requestFullscreen(); markActivity(); } else { enteredFullscreen = false; exitFullscreen(); }
    syncUI();
    // Layout changes size of the canvas; ResizeObserver handles it.
  }

  // ---- Viewing mode: edge-reveal of controls, idle cursor ---------------
  let enteredFullscreen = false;
  const reveal = { top: false, bottom: false, right: false };
  const EDGE = 70; // px from the top/bottom edge that reveals a bar
  const EDGE_RIGHT = 36; // narrower on the right so the canvas stays usable
  const topbarEl = $('topbar');
  const controlsEl = $('controls');
  const panelEl = $('panel');

  function setReveal(top, bottom, right) {
    reveal.top = top; reveal.bottom = bottom; reveal.right = right;
    document.body.classList.toggle('reveal-top', top);
    document.body.classList.toggle('reveal-bottom', bottom);
    document.body.classList.toggle('reveal-right', right);
  }

  let idleTimer = 0;
  function markActivity() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    if (state.presenting) {
      idleTimer = setTimeout(() => {
        if (state.presenting && !reveal.top && !reveal.bottom && !reveal.right) document.body.classList.add('idle');
      }, 2500);
    }
  }

  document.addEventListener('pointermove', (e) => {
    if (!state.presenting) return;
    markActivity();
    const x = e.clientX; const y = e.clientY;
    const w = window.innerWidth; const h = window.innerHeight;
    // Once revealed, an element stays visible while the pointer is over it.
    const top = y < EDGE || (reveal.top && y < topbarEl.offsetHeight + 16);
    const bottom = y > h - EDGE || (reveal.bottom && y > h - controlsEl.offsetHeight - 16);
    const right = x > w - EDGE_RIGHT || (reveal.right && x > w - panelEl.offsetWidth - 16);
    if (top !== reveal.top || bottom !== reveal.bottom || right !== reveal.right) setReveal(top, bottom, right);
  });
  document.documentElement.addEventListener('mouseleave', () => {
    if (state.presenting) setReveal(false, false, false);
  });

  function onFullscreenChange() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    // The browser's own Esc leaves fullscreen without a keydown: leave viewing mode too.
    if (!fsEl && state.presenting && enteredFullscreen) setPresenting(false);
    dirty = true;
  }

  function togglePresentLabels() {
    state.presentLabels = !state.presentLabels;
    document.body.classList.toggle('show-text', state.presenting && state.presentLabels);
    dirty = true;
  }

  function togglePanel() {
    document.body.classList.toggle('panel-closed');
  }

  function openInfo(open) {
    ui.info.hidden = !open;
  }

  // ---- Build controls ----------------------------------------------------
  buildSegmented(ui.frameSelector, FRAME_ORDER.map((id) => ({
    value: id,
    html: `<span class="dot" style="--c:${model.byId[id].color}"></span>${model.byId[id].name}`,
    title: frameName(id) + (id === 'sun' ? ' (key 1)' : id === 'earth' ? ' (key 2)' : ''),
  })), setFrame);

  buildSegmented(ui.speedSelector, CONFIG.speeds.map((v) => ({
    value: v,
    html: v + '×',
    title: v + (v === 1 ? ' simulated day' : ' simulated days') + ' per second',
  })), (v) => { state.speed = v; syncUI(); });

  buildSegmented(ui.trailYears, CONFIG.trailYears.map((v) => ({
    value: v, html: String(v), title: v + (v === 1 ? ' Earth year' : ' Earth years'),
  })), (v) => { state.trailYears = v; syncUI(); });

  buildSegmented(ui.presets, [
    { value: 'inner', html: 'Inner', title: 'Mercury, Venus, Earth, Mars' },
    { value: 'outer', html: 'Outer', title: 'Jupiter and Saturn (with Earth and the Sun)' },
    { value: 'far', html: 'Far', title: 'Jupiter, Saturn, Uranus, Neptune and Pluto (with Earth and the Sun)' },
    { value: 'all', html: 'All', title: 'All bodies' },
  ], setPreset);

  model.bodies.forEach((b) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'chip';
    el.dataset.id = b.id;
    el.innerHTML = `<span class="dot" style="--c:${b.color}"></span>${b.name}`;
    el.addEventListener('click', () => toggleBody(b.id));
    ui.bodyToggles.appendChild(el);
  });

  ui.timeline.min = '0';
  ui.timeline.max = String(Math.round(state.timelineMax));
  ui.timeline.addEventListener('input', () => setTime(Number(ui.timeline.value)));

  ui.play.addEventListener('click', togglePlay);
  $('btn-reset').addEventListener('click', resetSimulation);
  $('btn-back').addEventListener('click', () => step(-CONFIG.stepDays));
  $('btn-fwd').addEventListener('click', () => step(CONFIG.stepDays));
  ui.compare.addEventListener('click', () => setCompare(!state.compare));
  ui.present.addEventListener('click', () => setPresenting(!state.presenting));
  $('btn-panel').addEventListener('click', togglePanel);
  $('btn-info').addEventListener('click', () => openInfo(true));
  $('btn-info-close').addEventListener('click', () => openInfo(false));
  ui.info.addEventListener('click', (e) => { if (e.target === ui.info) openInfo(false); });
  $('btn-zoom-in').addEventListener('click', () => zoomCentre(1.25));
  $('btn-zoom-out').addEventListener('click', () => zoomCentre(1 / 1.25));
  $('btn-fit').addEventListener('click', () => { activeViews().forEach(fitCamera); dirty = true; });
  $('btn-cam-reset').addEventListener('click', () => { activeViews().forEach(resetCamera); dirty = true; });
  ui.optTrails.addEventListener('change', () => { state.showTrails = ui.optTrails.checked; syncUI(); });
  ui.optFull.addEventListener('change', () => setFullTrajectories(ui.optFull.checked));
  ui.optFade.addEventListener('change', () => { state.fade = ui.optFade.checked; syncUI(); });
  ui.epicycleSelect.addEventListener('change', () => setEpicycle(ui.epicycleSelect.value));

  // ---- Pointer: wheel zoom, drag pan, pinch zoom -------------------------
  function localPoint(e) {
    const r = scene.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  scene.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = localPoint(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= H;
    const k = e.ctrlKey ? 0.01 : 0.0015; // ctrlKey = trackpad pinch
    zoomAt(viewAt(x), Math.exp(-dy * k), x, y);
  }, { passive: false });

  const pointers = new Map();
  let pinch = null;
  scene.addEventListener('pointerdown', (e) => {
    scene.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPoint(e));
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    }
  });
  scene.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = localPoint(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      const v = viewAt(cur[0]);
      v.cam.cx -= (cur[0] - prev[0]) / v.cam.scale;
      v.cam.cy += (cur[1] - prev[1]) / v.cam.scale;
      v.cam.auto = false;
      dirty = true;
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch.dist > 0) {
        const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
        zoomAt(viewAt(mx), dist / pinch.dist, mx, my);
      }
      pinch.dist = dist;
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  scene.addEventListener('pointerup', endPointer);
  scene.addEventListener('pointercancel', endPointer);
  scene.addEventListener('dblclick', (e) => {
    const [x] = localPoint(e);
    resetCamera(viewAt(x));
    dirty = true;
  });

  // ---- Keyboard ----------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    const inFormControl = tag === 'SELECT' || tag === 'INPUT';
    const k = e.key;

    if (!ui.info.hidden) {
      if (k === 'Escape' || k === 'i' || k === 'I') { openInfo(false); e.preventDefault(); }
      return;
    }

    switch (k) {
      case ' ':
        if (tag === 'SELECT') return;
        e.preventDefault();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        togglePlay();
        break;
      case 'r': case 'R': resetSimulation(); break;
      case '1': setFrame('sun'); break;
      case '2': setFrame('earth'); break;
      case 'f': case 'F': activeViews().forEach(fitCamera); dirty = true; break;
      case 'p': case 'P': setPresenting(!state.presenting); break;
      case 'c': case 'C': setCompare(!state.compare); break;
      case 'e': case 'E': setEpicycle(state.epicycle === 'off' ? state.lastEpicycle : 'off'); break;
      case 't': case 'T': state.showTrails = !state.showTrails; syncUI(); break;
      case 'g': case 'G': setFullTrajectories(!state.fullTrajectories); break;
      case 'i': case 'I': openInfo(true); break;
      case 'l': case 'L': togglePresentLabels(); break;
      case '+': case '=': zoomCentre(1.25); break;
      case '-': case '_': zoomCentre(1 / 1.25); break;
      case 'ArrowLeft':
        if (inFormControl) return;
        e.preventDefault(); step(e.shiftKey ? -1 : -CONFIG.stepDays); break;
      case 'ArrowRight':
        if (inFormControl) return;
        e.preventDefault(); step(e.shiftKey ? 1 : CONFIG.stepDays); break;
      case 'Escape':
        if (state.presenting) setPresenting(false);
        break;
      default:
    }
  });

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ---- Main loop ---------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (state.playing) setTime(state.t + state.speed * dt);
    if (dirty) { render(); dirty = false; }
    requestAnimationFrame(frame);
  }

  // ---- Start -------------------------------------------------------------
  if (window.innerWidth < 900) document.body.classList.add('panel-closed');
  new ResizeObserver(resize).observe(wrap);
  resize();
  syncUI();
  requestAnimationFrame(frame);

  // Self tests → console.
  const results = model.selfTest();
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.warn('[self-test] FAILED', failed);
  else console.info('[self-test] all ' + results.length + ' checks passed', results);

  // Console access for debugging, e.g. SolarSystem.actions.setFrame('mars')
  window.SolarSystem = {
    model, state, CONFIG,
    actions: { setFrame, setCompare, setEpicycle, setPreset, setTime, setPresenting, togglePlay, resetSimulation, setFullTrajectories },
  };
})();
