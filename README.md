# Last Stop Motel

A destructible Three.js motel with photographic PBR surfaces and worker-based Rapier physics.

Live: https://cyberdreadx.github.io/last-stop-motel/

## GitHub Pages

Pushes to `main` run tests, build Vite with `/last-stop-motel/` as the base path, and deploy through GitHub Actions. The site is static and needs no running PC or Tailscale connection. The high-resolution assets are large, and mobile performance depends on the device.

# Last Stop Motel

Destructible roadside motel built with Three.js **0.186.1 (r186)**, Rapier **0.19.3**, and Vite.

## Run

```sh
npm install
npm run build
npm run preview
```

The optimized production app opens at **http://127.0.0.1:5188/**. Stop the preview before starting `npm run dev`, which uses the same port.

```sh
npm test
npm run benchmark
node benchmarks/destruction.js --before
```

## Controls

- Drag to orbit, scroll to zoom, right-drag to pan.
- **Blast / 2:** click the building or fallen rubble. Adjust **Blast strength** for stronger impulses.
- **Demolish:** progressively fail ground-floor supports and let gravity bring the structure down.
- **Rebuild / R:** clear the world and restore the motel.
- **Explore / 1:** camera exploration.
- **H / Hide UI:** unobstructed view; H restores the interface.

## Performance

The 60 Hz physics simulation runs in a dedicated worker. These optimizations preserve the 4K albedo/normal/roughness maps, 8K HDR environment, texture filtering, main rendering resolution, 4096-pixel directional shadows, visible meshes, and material settings:

- Prefabricated, deterministic Voronoi fracture templates and indexed convex-polyhedron collision meshes avoid hull reconstruction during an impact. Templates are transferred once and reused by render batches.
- Welded assemblies use mass-preserving collision envelopes. Railings keep separate rail/post proxies rather than a solid panel.
- Intact structures report impact forces; already active debris does not generate redundant force events.
- Supported rubble that stays within a small position/orientation tolerance is consolidated into fixed collision bodies. Colliders stay in the world. Blasts and hard impacts reactivate them; airborne debris is never consolidated.
- Support relationships are indexed ahead of time, and structural releases are spread over fixed simulation steps.
- Worker snapshots send only changed transforms at up to 30 Hz using recycled transferable buffers and two-message backpressure. Interpolation smooths motion between snapshots.
- Unchanged debris skips matrix uploads. Changed transforms update texture ranges rather than uploading whole matrix textures.
- Shadow maps update once when visual geometry changes and are reused by the AO pass. Dust uses one instanced draw instead of separate sprites. Ambient occlusion uses half-resolution buffers with full-resolution compositing; surface textures and main image resolution stay unchanged.

An isolated production browser test over a full collapse recorded **36.39 FPS average**, **33.9 ms p95 frame time**, and **12.5 ms p95 physics step**. It advanced **17.97 seconds of simulation in 18.01 seconds of wall time**, with up to **1,313 rigid bodies**. The browser verified 4096-pixel concrete/asphalt/sand maps and an 8192-pixel environment. See `benchmarks/browser-after.json` and `optimized-destruction.png`.

The repeatable CPU benchmark simulates 10 seconds of the actual motel layout. On this machine, elapsed CPU time changed from **9.772 s to 2.845 s** (about **3.4× faster**), with p95 steps changing from **22.58 ms to 10.54 ms**. Runs vary with hardware, load and rubble configuration. Recorded results are in `benchmarks/before.json` and `benchmarks/after.json`; `benchmarks/physics-before.js` preserves the original solver for comparison. The browser's `data-benchmark` canvas attribute records an 18-second test after Demolish or Blast.

## Rendering and physics

16 furnished rooms with weathered concrete and painted trim, physical glass, a pool, roadside sign, photographic desert background and PBR surface maps. ACES tone mapping, HDR reflections, contact AO and restrained bloom provide the lighting.

Concrete and glazing fracture into clipped Voronoi cells with exposed interior faces. Metal components and furnishings become rigid bodies. Density determines mass; impulses attenuate with distance and mass. Gravity, friction, restitution, selective CCD and collision solving handle impacts and rubble stacking. Debris collides with the building, other debris, pavement and wheel stops. A per-bay support model drives progressive structural failure.

This is a real-time fracture approximation rather than a finite-element stress solver. Metal deformation is represented by detached rigid assemblies. The distant photographic HDR environment has no positional parallax. Original photographic assets total roughly 180 MB and need suitable GPU texture memory.

## Validation

`npm test` covers fracture mass conservation, debris collisions and stacking, support-loss collapse, welded assembly motion and mass, supported-rubble consolidation/reactivation, prevention of midair consolidation, reset cleanup, cold worker startup and queued commands, worker geometry/transform transfer, buffer-compatible message counts, interpolation, dirty GPU uploads, render-batch growth and frame metrics. Full collapses and rebuilds are also checked in the production browser.

## Asset credits

All photographic assets are [Poly Haven CC0 assets](https://polyhaven.com/license), stored locally in `public/assets`:

- [Concrete Wall 007](https://polyhaven.com/a/concrete_wall_007): 4K diffuse, normal, roughness.
- [Aerial Asphalt 01](https://polyhaven.com/a/aerial_asphalt_01): 4K diffuse, normal, roughness.
- [Coast Sand 01](https://polyhaven.com/a/coast_sand_01): 4K diffuse, normal, roughness.
- [Goegap](https://polyhaven.com/a/goegap): 8K HDRI.

Three.js uses MIT; Rapier uses Apache-2.0. Google Fonts is optional, with local fallbacks.

Mobile loading uses UASTC KTX2 maps (4K surface resolution, 8K sky) on devices with supported GPU compression. It decodes one map at a time, with one transcoder worker, and uses a 1K HDR lighting probe separately from the 8K visible sky. Desktop retains original JPEG maps and 8K HDR. UASTC is high-quality lossy GPU compression; source assets remain available. The loader reports downloads and surfaces failures with Retry. Force this path with ?mobile=1. Rebuild converted textures with node scripts/prepare-mobile-textures.mjs and the sky with node scripts/prepare-mobile-sky.mjs.

