# Build a Solar System Orbit Visualisation Web App

Create a polished, interactive, static web application that visualises planetary motion from different reference frames, especially Earth-centred and Sun-centred perspectives.

## 1. Purpose

The application demonstrates how the same planetary motions can produce visually complex looping trajectories when viewed from Earth, but relatively simple, elegant orbital paths when viewed from the Sun.

The application must be scientifically credible, visually beautiful, intuitive to operate during a live presentation, and suitable for projection onto a large screen.

**Important scientific distinction:** This is a visualisation of coordinate systems and relative motion, not a claim that visual simplicity alone proves heliocentrism. Do not label the Earth-centred reference frame as the historical Ptolemaic model.

## 2. Technology

- Pure HTML5, CSS3, and JavaScript.
- HTML Canvas 2D for rendering.
- No backend, build tools, package manager, or framework.
- No external libraries or CDN dependencies.
- The application must work by opening `index.html` directly in a modern browser.
- Use `requestAnimationFrame` for smooth rendering.
- Separate code into `index.html`, `style.css`, and `app.js`.

## 3. Planetary Simulation

Include:

- Sun
- Mercury
- Venus
- Earth
- Mars
- Jupiter
- Saturn

Use a simplified coplanar, circular-orbit model with realistic relative orbital radii and sidereal periods.

Suggested approximate values:

| Planet | Orbital radius (AU) | Orbital period (Earth days) |
|---|---:|---:|
| Mercury | 0.387 | 87.97 |
| Venus | 0.723 | 224.70 |
| Earth | 1.000 | 365.256 |
| Mars | 1.524 | 686.98 |
| Jupiter | 5.203 | 4332.59 |
| Saturn | 9.537 | 10759.22 |

Use configurable initial orbital phases so planets do not all start aligned.

Planet positions must be calculated from absolute simulation time, not by incrementally rotating positions each frame.

A circular-orbit approximation is sufficient for this visualisation, but clearly label the simulation as simplified. Do not claim that actual planetary orbits are perfect circles.

## 4. Reference Frame Selection

Provide a prominent selector:

- Sun-centred
- Earth-centred
- Mercury-centred
- Venus-centred
- Mars-centred
- Jupiter-centred
- Saturn-centred

When the reference frame changes:

1. The selected celestial body becomes stationary at the centre of the viewport.
2. All other bodies move relative to that body.
3. Orbital trails must be recomputed using the selected reference frame.
4. Preserve the current simulation time.
5. Preserve play/pause state.

Use:

`relativePosition = worldPosition(body, t) - worldPosition(referenceBody, t)`

The Sun must also move in Earth-centred mode, tracing its apparent annual circular path.

Do not implement independent artificial trajectories for different reference frames. All views must be derived from the same underlying planetary positions.

## 5. Trajectory Visualisation

This is the most important feature.

Draw persistent, smooth, coloured orbital trails for each enabled planet.

The trails must clearly show:

- Simple circular paths in Sun-centred mode.
- Loops and retrograde motion in Earth-centred mode.
- More complex trajectories in other planet-centred frames.

Include:

- Show/hide trails toggle.
- Per-planet visibility controls.
- Trail duration selector: 1, 2, 5, 10 Earth years.
- A default trail duration suitable for demonstrating multiple retrograde loops.
- Optional subtle fading for older trail segments.
- A "Show Full Trajectories" mode that draws the entire selected time window immediately, without requiring the user to wait for the animation.

Full trajectories should be drawn from a configurable historical interval ending at the current simulation time, so the current planet positions match the endpoints of their trails.

Use sufficient sampling resolution to produce smooth curves, including Mercury's fast orbital motion.

When paused, all trajectories must remain visible.

## 6. Animation Controls

Provide:

- Play / Pause.
- Reset simulation.
- Speed selector: 1x, 10x, 50x, 100x.
- Timeline slider to scrub simulation time.
- Step forward/backward controls.
- Display of elapsed simulation days and years.

Define the simulation speed clearly, e.g. simulated days per real second, rather than leaving "1x" ambiguous.

Changing playback speed must not affect the physical trajectories.

## 7. Camera and Scaling

Include:

- Zoom in/out.
- Fit visible trajectories.
- Reset camera.
- Mouse wheel zoom.
- Touchpad-friendly zoom if practical.

Provide convenient presets:

**Inner Solar System**
Mercury, Venus, Earth, Mars.

**Outer Solar System**
Jupiter and Saturn, optionally with inner planets.

**All Planets**
All supported planets.

The initial preset should be Inner Solar System.

For the default view, optimise the camera to make Earth-centred loops clearly visible.

Do not use arbitrary per-planet distance scaling that would distort the trajectories. Use a uniform spatial scale.

The simulation may use visually enlarged planet markers for legibility, but orbital distances must remain geometrically consistent.

## 8. Presentation Mode

Create a clean, professional, visually striking interface suitable for a projector.

Visual direction:

- Dark navy/black background.
- Subtle starfield.
- Smooth anti-aliased trajectories.
- Distinct, aesthetically balanced colours for planets.
- Clear planet labels.
- Large, readable controls.
- Minimal visual clutter.
- Responsive layout for 16:9 presentation screens.

Provide a Presentation Mode button that:

- Hides secondary configuration controls.
- Keeps the reference-frame selector and playback controls visible.
- Enlarges labels appropriately.
- Supports browser fullscreen using the Fullscreen API.
- Gracefully falls back if fullscreen is unavailable.

Keyboard shortcuts:

- Space: Play/Pause.
- R: Reset.
- 1: Sun-centred.
- 2: Earth-centred.
- F: Fit trajectories.
- P: Toggle presentation mode.

## 9. Comparison Mode

Implement an optional side-by-side comparison:

Left: Earth-centred.
Right: Sun-centred.

Requirements:

- Both views use exactly the same simulation time.
- Both views advance synchronously.
- Each view has its own camera transform.
- Planet colours are identical in both views.
- Trajectories are generated from the same underlying model.
- Clear headings: "Earth-centred" and "Sun-centred".
- Allow returning to single-view mode.

This feature is especially important because viewers should immediately understand that the same physical motion can look very different depending on the reference frame.

## 10. Educational Information

Include a small optional information panel explaining:

- Retrograde motion.
- Reference frames.
- Why Earth-centred trajectories can form loops.
- Why Sun-centred circular approximations produce simpler paths.
- Why the visual comparison alone does not establish which historical cosmological theory is correct.
- Actual planetary orbits are elliptical, and this demonstration uses circular approximations.

Keep explanations short and accessible to a general audience.

## 11. Performance and Correctness

- Target smooth animation at 60 FPS on a typical laptop.
- Handle high-DPI displays.
- Cache sampled trajectory geometry where useful.
- Avoid unnecessary recomputation every animation frame.
- Handle browser resizing.
- Do not allow trajectories to become disconnected when changing playback speed or scrubbing.
- Validate that all reference frames produce mathematically consistent relative positions.
- Ensure Earth remains fixed at the centre in Earth-centred mode.
- Ensure the Sun remains fixed at the centre in Sun-centred mode.
- Ensure Mars exhibits retrograde loops relative to Earth.
- Ensure the side-by-side views remain synchronised.

## 12. Deliverables

Create these files:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

The README should explain:

- How to run the app locally.
- Simulation assumptions and limitations.
- Keyboard shortcuts.
- How to operate the app during a live presentation.

No installation should be required.

## 13. Priorities

Implement in this order:

1. Correct orbital mathematics and reference-frame transformations.
2. Beautiful, clear trajectory rendering.
3. Smooth playback and timeline controls.
4. Presentation-friendly UI.
5. Side-by-side comparison.
6. Additional controls and polish.

Do not sacrifice mathematical correctness for visual effects.

The final result should feel like an interactive science museum exhibit rather than a developer debugging tool.

## 14. Amendments (agreed during planning)

### 14.1 Playback speeds

- 1x is defined as **1 simulated day per real second**.
- Speed options: 1x, 2x, 4x, 10x, 50x, 100x.

### 14.2 Trail duration

- In addition to 1, 2, 5 and 10 Earth years, a 30-year option is provided so that Saturn's full orbit can be shown in the Sun-centred frame.

### 14.3 Historical epicycle interpretation (overlay)

An optional overlay for the Earth-centred view that shows how the same apparent motion can be described with a deferent and an epicycle, as pre-Copernican astronomers did.

- It is an *interpretation overlay*, not a separate trajectory model. Every circle is derived from the same underlying circular-orbit positions:
  - Superior planets (Mars, Jupiter, Saturn): deferent radius = planet's orbital radius, epicycle radius = Earth's orbital radius (1 AU), epicycle centre = heliocentric position of the planet.
  - Inferior planets (Mercury, Venus): deferent radius = 1 AU (the Sun's apparent path), epicycle radius = planet's orbital radius, epicycle centre = apparent position of the Sun.
  - In both cases `epicycle centre + epicycle arm = relativePosition(planet, Earth, t)` exactly.
- The overlay must be labelled as a simplified historical interpretation (no eccentric, no equant, and absolute distances were unknown historically).
- Selecting the overlay switches to the Earth-centred frame. Selecting another frame turns it off.

### 14.4 Outer planets, Pluto and camera behaviour

- Uranus, Neptune and the dwarf planet Pluto are added. They are hidden by default, and can be selected as reference frames.
- Uranus and Neptune use the circular model. Pluto's orbit is clearly elliptical (e ≈ 0.25), so it is computed as a coplanar Keplerian ellipse (Sun at one focus). Its inclination is ignored.
- The epicycle overlay is available for Uranus and Neptune, but not for Pluto.
- Presets: Inner, Outer (Jupiter, Saturn), Far (Jupiter, Saturn, Uranus, Neptune, Pluto), All (every body). Outer and Far also show the Sun and Earth.
- Speed options add 500x and 1000x. Trail duration options add 100 and 250 Earth years.
- Changing the body preset or the epicycle overlay does not change the camera zoom. The camera resets only if the overlay forces a switch to the Earth-centred frame.
- The page title is "Solar System Sim".
