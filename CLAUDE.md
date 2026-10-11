# Alex Phu portfolio site

Live at https://alex-phu.github.io (GitHub Pages: repo `Alex-Phu/alex-phu.github.io`, branch `main`, folder `/`).
Custom domain `alexphu.com` is planned but not bought yet.

## What the site is

A single-page 3D portfolio:

1. A BIOS-style boot screen with real loading progress and a BOOT button (the click also unlocks audio).
2. A bright office diorama with lighting baked in Blender, rendered with three.js 0.160 (loaded from jsDelivr through an import map).
3. Clickable objects with pulsing teal outline glows. Clicking one moves the camera and opens a project card.
4. The monitor shows "AlexOS", a small desktop drawn as HTML with CSS3DRenderer behind a transparent hole in the WebGL canvas. On phones (width under 700 px) the OS opens as a full-screen panel instead.
5. Sound is synthesized with Web Audio (startup chime, quiet cafe ambience, loud ball-mouse clicks, key clacks). There are no audio files.

The concept is inspired by henryheffernan.com and is credited on the page. No code or assets were copied from his repos.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page structure only: BIOS screen, header, buttons, card and phone OS panel, plus the three.js import map. |
| `css/style.css` | All styles. |
| `js/main.js` | Entry point (ES module): page content (`SPOTS`, `OS_APPS`), BIOS boot sequence, page state, pointer and keys, render loop. |
| `js/scene.js` | Renderers, model loading, camera moves, glow outlines, hotspot picking. |
| `js/os.js` | AlexOS: the monitor version and the phone panel. |
| `js/sound.js` | Web Audio synthesis. |
| `assets/desk.glb` | The baked room exported from Blender (about 2.2 MB), loaded directly by `GLTFLoader`. |
| `tools/scene.py` | Builds the room in Blender (bpy), bakes lighting with Cycles, exports `desk.glb`. |
| `HANDOFF.md` | The phased to-do list for this site. |

`tools/embed.py` is retired. It packed the model into `index.html` as base64 because claude.ai previews could not serve `.glb` files. GitHub Pages can, so the page now loads `assets/desk.glb` directly.

To preview locally, run `python -m http.server 8000` in this folder and open http://localhost:8000. Opening `index.html` as a file does not work, because ES modules and the model need a web server.

## Rebuilding the room

```
pip install bpy numpy pillow scipy        # needs Python 3.13, the version the bpy wheel targets
python tools/scene.py out final gpu       # modes: draft (~30 s CPU), medium, final; add "gpu" to use the graphics card
cp out/desk.glb assets/desk.glb
```

A final bake took about 12 minutes on a 2-core CPU. The GPU path (OptiX/CUDA) is written but untested; the first log lines say which device it used.

## How the 3D scene fits together

- Blender units are meters with Z up. The page scales the model by 100, so scene units are centimeters.
- Clickable objects are found by name prefix: `computer_`, `askaapm_`, `shield_`, `kinetiq_`, `chess_`. Each prefix matches a key in the `SPOTS` object in `js/main.js`, which holds the card text. Objects without a prefix are decoration.
- The `screen` plane marks where AlexOS is placed. The `sky` plane is the backdrop seen through the window.
- Baking: an albedo pass (2048 px) times a diffuse lighting pass (1024 px, cleaned with a masked blur), then ACES tone mapping, saved as one JPEG atlas per group (room, desk, computer, props). The page uses `MeshBasicMaterial` with `NoToneMapping`.
- The BIOS progress bar follows the real download of `desk.glb`. GitHub Pages gzips the file, so the bar divides by `DESK_BYTES` in `js/scene.js`, the uncompressed size. Update it after a re-bake (`ls -l assets/desk.glb`). If the model fails to load, the BIOS screen says so, shows the contact email, and BOOT stays disabled.
- Glow outlines are inflated back-face copies of each clickable mesh, offset in screen space. Pieces thinner than 3 mm (racket strings, filament) are left out so they do not fill with color.

## Content rules

- Project and paper text lives in `SPOTS` and `OS_APPS` in `js/main.js`. Phase 2 of `HANDOFF.md` moves it into `data/projects.json`.
- AskAAPM and the 3D-printed shield manuscripts are "submitted". Keep statuses accurate.
- The contact email shown on the site is public on purpose. Never publish a home address or phone number, including in any resume PDF.

## Planned next

- A `data/projects.json` as the one source for project content.
- Richer pages that visualize projects and research, plus a link to a redacted resume PDF.
- Connect `alexphu.com`: four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `alex-phu.github.io`.
- Optional speedup: re-bake only the colors (reuse the lighting pass) when an object is just recolored.
