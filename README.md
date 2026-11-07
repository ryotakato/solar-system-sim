# Solar System Sim

An interactive visualisation of planetary motion seen from different reference frames.

**Live:** https://ryotakato.github.io/solar-system-sim/

The same planetary motions trace simple circles when seen from the Sun, and looping, retrograde paths when seen from Earth. Every view is computed from **one** underlying model:

```
relativePosition = worldPosition(body, t) − worldPosition(referenceBody, t)
```

The original requirements are in [`SPEC.md`](SPEC.md).

## Running it

No installation, build step or internet connection is needed.

- **Simplest:** double-click `index.html`, or open it in any modern browser (Chrome, Edge, Firefox or Safari).
- **Optional local server:**
  ```sh
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

Files:

| File | Contents |
|---|---|
| `index.html` | Page structure and information text |
| `style.css` | Visual design, including presentation mode |
| `app.js` | Orbital model, rendering and controls |
| `SPEC.md` | Requirements and the changes agreed during planning |

## Viewing and presenting

1. Open `index.html`. It starts paused, in the **Earth-centred** view of the inner planets, with 5-year trajectories already drawn.
2. Press **P** for presentation (viewing) mode. The browser goes fullscreen and only the orbits remain: the bars, the settings panel, headings and labels are hidden.
   - Move the pointer to the **top** edge to show the reference-frame bar, the **bottom** edge for playback controls, or the **right** edge for settings.
   - Press **L** to show or hide text (headings, planet names and scale) when you want to explain something.
   - The cursor hides itself after a few seconds without movement.
   - Press **P** or **Esc** to leave. Leaving the browser's fullscreen also leaves viewing mode.
   - If fullscreen is blocked, use the browser's own fullscreen (F11 or ⌃⌘F) instead.
3. Suggested flow:
   - **Earth-centred (2):** show Mars's retrograde loops and the dense patterns of Venus and Mercury.
   - **Sun-centred (1):** the same motion becomes simple circles.
   - **Compare (C):** both views side by side, running in sync. Press **Space** to play.
   - **Epicycles (E):** the historical "circles on circles" explanation, drawn on top of the Earth-centred view.
4. To watch trails being drawn from scratch rather than shown all at once, press **G** to turn off full trajectories, then press **Space**.
5. Press **R** to return to day 0.

Tips:

- **10×** (10 simulated days per second) is a good live speed. Mars completes one retrograde cycle in about 78 seconds.
- Use **50×** or **100×** to show long-term patterns quickly.
- To show Jupiter and Saturn, open Settings and choose the **Outer** or **All** preset. A 30-year trail shows Saturn's full orbit.
- Uranus, Neptune and Pluto are off by default. Choose the **Far** or **All** preset, then use a 100- or 250-year trail and **500×** or **1000×** speed (Pluto takes about 90 seconds per orbit at 1000×).
- Changing the preset or the epicycle overlay keeps the current zoom. Press **F** (Fit) or Reset to reframe.

## Controls

| Control | Function |
|---|---|
| View from (top bar) | Choose the reference frame (Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto) |
| Compare | Earth-centred (left) and Sun-centred (right), same time, separate cameras |
| ▶ / ⏸, step, reset | Playback. Each step is 10 days (1 day with Shift + arrow key) |
| Timeline | Scrub simulation time |
| Speed | 1×, 2×, 4×, 10×, 50×, 100×, 500×, 1000×. **1× = 1 simulated day per real second** |
| Settings → Trails | Show/hide trails, full trajectories, fading, trail length (1, 2, 5, 10, 30, 100, 250 Earth years) |
| Settings → Bodies | Inner / Outer / Far / All presets and per-body visibility |
| Settings → Camera | Zoom, Fit, Reset. You can also scroll or pinch to zoom, drag to pan, and double-click to re-centre |
| Settings → Historical view | Epicycle overlay for one planet or all visible planets (not Pluto) |

### Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| R | Reset simulation to day 0 |
| 1 | Sun-centred |
| 2 | Earth-centred |
| C | Toggle side-by-side comparison |
| E | Toggle epicycle overlay |
| T | Show / hide trails |
| G | Toggle full trajectories / growing trails |
| F | Fit visible trajectories |
| + / − | Zoom in / out |
| ← / → | Step 10 days (Shift: 1 day) |
| P | Toggle presentation (viewing) mode with fullscreen |
| L | Show / hide text in viewing mode |
| I | Information panel (Esc closes it) |

## Simulation model and its limitations

**This is a deliberately simplified model.**

- **Circular, coplanar orbits.** Each planet moves at a constant speed on a circle in one plane. Real orbits are ellipses (Kepler's first law), are slightly inclined to each other, and planets move faster near the Sun.
- **Pluto is the exception.** Its orbit is clearly elliptical (e ≈ 0.25; 29.7–49.3 AU), so it is computed from Kepler's equation (Sun at one focus, longitude of perihelion 224.07°) and its path dips inside Neptune's. Its 17° inclination is ignored. Uranus (e ≈ 0.05) and Neptune (e ≈ 0.01) are close to circular and use the circular model.
- **Real average values.** Orbital radii (in AU) and sidereal periods (in days) are realistic averages:

  | Planet | Radius (AU) | Period (days) |
  |---|---:|---:|
  | Mercury | 0.387 | 87.97 |
  | Venus | 0.723 | 224.70 |
  | Earth | 1.000 | 365.256 |
  | Mars | 1.524 | 686.98 |
  | Jupiter | 5.203 | 4332.59 |
  | Saturn | 9.537 | 10759.22 |
  | Uranus | 19.191 | 30688.5 |
  | Neptune | 30.069 | 60182 |
  | Pluto (semi-major axis) | 39.482 | 90560 |

- **Starting phases.** On day 0, planets are placed at their approximate mean longitudes on 1 January 2000. You can change these in `CONFIG.initialLongitudesDeg` at the top of `app.js`. Positions only approximate the real sky, since mean longitudes ignore orbital eccentricity, so this is not an ephemeris.
- **Uniform scale.** Every distance uses the same scale; no planet's distance is stretched or compressed. Planet markers are drawn much larger than true size so they can be seen.
- **Positions from absolute time.** Positions are always calculated directly from the simulation time, never by adding up small steps. Changing speed or scrubbing therefore cannot change or break a trajectory.
- **The Moon and dwarf planets other than Pluto** are not included.

### Epicycle overlay

The epicycle overlay is an *interpretation* of the Earth-centred motion, not a separate model. Its circles come from the same orbital data:

- **Mars, Jupiter, Saturn, Uranus, Neptune:** deferent = the planet's orbit; epicycle = Earth's orbit (1 AU).
- **Mercury, Venus:** deferent = the Sun's apparent annual path (1 AU); epicycle = the planet's orbit.

Pluto has no epicycle overlay, because its orbit is not a circle.

In both cases, deferent position + epicycle arm = the planet's Earth-centred position, exactly. Historical models such as Ptolemy's added eccentrics and equants, and their absolute sizes were unknown at the time. Those details are not shown here.

### What the demonstration does not claim

Every reference frame is mathematically valid. That a view looks simple is not, on its own, proof of which cosmology is correct. The Earth-centred view in this app is a change of viewpoint. It is **not** a reproduction of the historical Ptolemaic model.

## Correctness checks

`app.js` contains self-tests that run automatically when the page loads. The results appear in the browser's developer console as `[self-test] …`. The checks confirm that:

- each reference body stays exactly at the centre of its own frame (for example, Earth in the Earth-centred view and the Sun in the Sun-centred view);
- all frames are consistent with each other: rel(A, C) = rel(A, B) + rel(B, C);
- the Sun traces a 1 AU circle once per year in the Earth-centred frame and never moves retrograde;
- Mars shows about 7 retrograde loops relative to Earth over 15 years;
- cached trail samples match the exact positions, and each trail ends exactly at the planet's current position;
- the deferent + epicycle construction reproduces the Earth-centred positions;
- Pluto's orbit has the expected perihelion and aphelion distances, closes after one period and sweeps equal areas in equal times.

The same tests can be run with Node:

```sh
node -e "const {model}=require('./app.js'); console.table(model.selfTest())"
```

## License

[MIT](LICENSE)
