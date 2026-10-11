# Alex Phu portfolio site

Live at https://alexphu.com (GitHub Pages: repo `Alex-Phu/alex-phu.github.io`, branch `main`, folder `/`). The old address https://alex-phu.github.io redirects there.

The domain is registered at Porkbun, which also runs its DNS: four A and four AAAA records for `alexphu.com` pointing at GitHub Pages, and a CNAME for `www` pointing to `alex-phu.github.io`. The `CNAME` file in this repo tells GitHub Pages which domain to serve; do not delete it. Leave Porkbun's MX, SPF and `_acme-challenge` records alone (email forwarding and Porkbun's SSL). WHOIS privacy is on at Porkbun; keep it on.

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
| `plain.html` | Text version of the whole site (no 3D, no JavaScript) for Google, screen readers and slow devices. Generated; linked from the BIOS screen. |
| `sitemap.xml`, `robots.txt` | For search engines. `sitemap.xml` is generated; `robots.txt` is fixed and points to it. |
| `css/style.css` | All styles, including AlexOS project windows. |
| `js/main.js` | Entry point (ES module): loads `data/`, builds the cards, explore buttons and AlexOS windows from it, runs the BIOS boot sequence, page state, pointer and keys, render loop. |
| `js/scene.js` | Renderers, model loading, camera moves, glow outlines, hotspot picking. |
| `js/os.js` | AlexOS: the monitor version and the phone panel, app windows and project windows. |
| `js/sound.js` | Web Audio synthesis. |
| `data/projects.json` | Every project and research item. The one source for cards and AlexOS windows. |
| `data/site.json` | Search details (`seo`: page title, description, bio, school), About and Contact text, the email, and the Computer label. About's `title` and `tip` are optional. The Person data uses `seo.name` (Alexander Phu) with `seo.alternateName` (Alex Phu); its `sameAs` links are `contact.links` (GitHub, LinkedIn) plus `seo.profiles` (ORCID). |
| `assets/projects/<id>/` | Web-ready images and videos for each project window. |
| `assets/desk.glb` | The baked room exported from Blender (about 2.2 MB), loaded directly by `GLTFLoader`. |
| `tools/build_seo.py` | Writes the `<head>` block in `index.html` (title, description, canonical link, Person structured data), the visible intro at the bottom of the BIOS screen (`intro:start` to `intro:end`, so Google sees real text on the homepage), `plain.html` and `sitemap.xml` from the data files. |
| `tools/scene.py` | Builds the room in Blender (bpy), bakes lighting with Cycles, exports `desk.glb`. |
| `HANDOFF.md` | The phased to-do list for this site. |
| `media-inbox/` | Alex's original photos and videos. Git-ignored: never commit it, only the processed copies in `assets/projects/`. |

`tools/embed.py` is retired. It packed the model into `index.html` as base64 because claude.ai previews could not serve `.glb` files. GitHub Pages can, so the page now loads `assets/desk.glb` directly.

To preview locally, run `python -m http.server 8000` in this folder and open http://localhost:8000. Opening `index.html` as a file does not work, because ES modules and the model need a web server.

## Rebuilding the room

```
python3 -m venv .venv                     # once; .venv/ is git-ignored. Needs Python 3.13, the version the bpy wheel targets
.venv/bin/pip install bpy numpy pillow scipy
.venv/bin/python tools/scene.py out/final final gpu   # modes: draft, medium, final; "gpu" uses the graphics card
cp out/final/desk.glb assets/desk.glb     # then set DESK_BYTES in js/scene.js to its new size
```

On Alex's Mac (Apple M2) the GPU path uses Metal: a final bake takes about 4 minutes. The very first GPU run is slower while Blender compiles its GPU code. On a 2-core CPU a final bake took about 12 minutes. The first log line says which device was used.

## How the 3D scene fits together

- Blender units are meters with Z up. The page scales the model by 100, so scene units are centimeters.
- Clickable objects are found by name prefix: `computer_`, `askaapm_`, `shield_`, `kinetiq_`, `chess_`. Each prefix matches the `prefix` of a project in `data/projects.json` (`computer` is defined in `data/site.json`). Objects without a prefix are decoration.
- The `screen` plane marks where AlexOS is placed. The `sky` plane is the backdrop seen through the window.
- Baking: an albedo pass (2048 px) times a diffuse lighting pass (1024 px, cleaned with a masked blur), then ACES tone mapping, saved as one JPEG atlas per group (room, desk, computer, props). The page uses `MeshBasicMaterial` with `NoToneMapping`.
- The BIOS progress bar follows the real download of `desk.glb`. GitHub Pages gzips the file, so the bar divides by `DESK_BYTES` in `js/scene.js`, the uncompressed size. Update it after a re-bake (`ls -l assets/desk.glb`). If the model fails to load, the BIOS screen says so, shows the contact email, and BOOT stays disabled.
- Glow outlines are inflated back-face copies of each clickable mesh, offset in screen space. Pieces thinner than 3 mm (racket strings, filament) are left out so they do not fill with color.

## Project data (`data/projects.json`)

Each entry in `projects` (file order is display order):

| Field | Used for |
| --- | --- |
| `id` | Stable name. Also the share link: `alexphu.com/#<id>` boots straight into that project's window. |
| `prefix` | Blender object prefix that makes it clickable in the room, or `null` if it has no object. |
| `kind` | `research` or `project`: which AlexOS window lists it. |
| `title` | Card heading and AlexOS heading. `osTitle` overrides the AlexOS heading if it should differ. |
| `label`, `hint` | Explore button text and hover tooltip (only for entries with a `prefix`). |
| `tag`, `summary`, `tech` | Card: small label, paragraph, and tech chips (only for entries with a `prefix`). |
| `meta` | Optional gray line under the AlexOS heading (role and status). |
| `short` | One-line description in AlexOS. |
| `links` | `[{ "label", "url" }]`. All show in AlexOS; the first also shows on the card. |
| `media` | `[{ "type": "image" or "video", "src", "poster" (videos), "width", "height", "alt", "caption" }]`, shown in order near the top of the project window. The card preview uses the first image, or the first video's poster. |
| `details` | Project window text: `built` (What I built), `steps` (How it works diagram), `results` (Status). Any project with `details` gets "Read more" on its card and in AlexOS. |

"Read more" never leaves the room: it zooms to the monitor and opens the project as a maximized AlexOS window with a back button (on phones, inside the AlexOS panel). There are no separate project pages.

To add a project, add one entry. To make it clickable in the room, it also needs a Blender object with that prefix in `tools/scene.py` and a re-bake.

## Adding photos and videos

Originals go in `media-inbox/` (git-ignored). Before anything goes into `assets/projects/<id>/`:

- Videos: muted, metadata stripped, H.264 MP4, 1600 px wide, well under 10 MB. Cut out anything private (file pickers, folder names, notifications). Example:
  `ffmpeg -i in.MOV -vf scale=1600:-2 -an -c:v libx264 -crf 21 -preset slow -tune stillimage -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -map_chapters -1 -fflags +bitexact -flags:v +bitexact demo.mp4`
- Posters and screenshots: WebP at most 1600 px wide, re-saved with Pillow so no EXIF, XMP, or location data survives.
- Check the outputs: `ffprobe -show_entries format_tags` should list only generic encoder tags, and WebP files should hold only a `VP8 ` chunk.
- Videos autoplay muted and loop with controls, only while their window is on screen. Visitors who ask for reduced motion get them paused.

## Content rules

- Project and paper text lives in `data/projects.json`. About and Contact live in `data/site.json`. Edit the JSON, not the JS.
- After editing either JSON file, run `python3 tools/build_seo.py` and commit what it changes, so `plain.html`, the search tags and the sitemap match the 3D site. Do not edit the `seo:start` to `seo:end` block in `index.html` by hand.
- `index.html` has a `google-site-verification` meta tag (Search Console ownership). It sits just above the generated block; do not remove it.
- The email also appears in `CONTACT` in `js/main.js`, which the BIOS shows if the data files fail to load. Change both together.
- AskAAPM and the 3D-printed shield manuscripts are "submitted". Keep statuses accurate.
- Project window text must come from Alex or from what his own screenshots and videos show. Do not add metrics or results he has not confirmed.
- Research figures and screenshots (AskAAPM, the shield, VISTA-3D) need his mentor's or lab's OK before they are published.
- The contact email shown on the site is public on purpose. Never publish a home address or phone number, including in any resume PDF.

## Planned next

- AskAAPM screenshot: a cleaned copy is at `media-inbox/processed/askaapm-answer.webp` (not committed). Alex wants to show part of it, pending his mentor's or lab's OK. Add it to `media` only after that.
- Project windows for the remaining projects (3D shield, VISTA-3D, Vital Tracker, RV Park), plus a link to a redacted resume PDF.
- Optional speedup: re-bake only the colors (reuse the lighting pass) when an object is just recolored.
