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
| `index.html` | The whole site: HTML, CSS and JS, with the baked model embedded as base64 at the end (about 3 MB). |
| `model/desk.glb` | The baked room exported from Blender. Source for the embed. |
| `tools/scene.py` | Builds the room in Blender (bpy), bakes lighting with Cycles, exports `desk.glb`. |
| `tools/embed.py` | Embeds `model/desk.glb` into `index.html`. |

## Rebuilding the room

```
pip install bpy numpy pillow scipy        # needs Python 3.13, the version the bpy wheel targets
python tools/scene.py out final gpu       # modes: draft (~30 s CPU), medium, final; add "gpu" to use the graphics card
python tools/embed.py out/desk.glb index.html
cp out/desk.glb model/desk.glb
```

A final bake took about 12 minutes on a 2-core CPU. The GPU path (OptiX/CUDA) is written but untested; the first log lines say which device it used.

## How the 3D scene fits together

- Blender units are meters with Z up. The page scales the model by 100, so scene units are centimeters.
- Clickable objects are found by name prefix: `computer_`, `askaapm_`, `shield_`, `kinetiq_`, `chess_`. Each prefix matches a key in the `SPOTS` object in `index.html`, which holds the card text. Objects without a prefix are decoration.
- The `screen` plane marks where AlexOS is placed. The `sky` plane is the backdrop seen through the window.
- Baking: an albedo pass (2048 px) times a diffuse lighting pass (1024 px, cleaned with a masked blur), then ACES tone mapping, saved as one JPEG atlas per group (room, desk, computer, props). The page uses `MeshBasicMaterial` with `NoToneMapping`.
- Textures are decoded with `createImageBitmap` from embedded base64 because claude.ai artifact previews block `blob:` URLs, which GLTFLoader uses by default. GitHub Pages has no such limit, so a split version can load `desk.glb` and its textures directly.
- Glow outlines are inflated back-face copies of each clickable mesh, offset in screen space. Pieces thinner than 3 mm (racket strings, filament) are left out so they do not fill with color.

## Content rules

- Project and paper text lives in `SPOTS` and `OS_APPS` in `index.html`.
- AskAAPM and the 3D-printed shield manuscripts are "submitted". Keep statuses accurate.
- The contact email shown on the site is public on purpose. Never publish a home address or phone number, including in any resume PDF.

## Planned next

- Split into separate files: `index.html`, `style.css`, `main.js`, `desk.glb` loaded directly, and a `projects.json` as the one source for project content.
- Richer pages that visualize projects and research, plus a link to a redacted resume PDF.
- Connect `alexphu.com`: four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `alex-phu.github.io`.
- Optional speedup: re-bake only the colors (reuse the lighting pass) when an object is just recolored.
