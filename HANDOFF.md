# Handoff: Alex Phu portfolio site

You are taking over Alex's 3D portfolio site from an earlier Claude session. Read `CLAUDE.md` first for how the site works. This file lists what to do, in order, and how to know each step is done.

Work one phase at a time. At the start of each phase, tell Alex in a few plain sentences what you are about to change. At the end, show him the result and wait for his OK before starting the next phase.

## Working rules

* Alex's style. Keep explanations short and step by step. Do not use em dashes in anything you write for him or put on the site.
* Preview before pushing. Run `python -m http.server 8000` in the project folder and check the site at http://localhost:8000 on a desktop-size window and a phone-size window (about 390 x 844). Check the browser console for errors. Use Playwright for screenshots if it is available.
* Never break the live site. Do each phase on a branch, merge to `main` only after the preview checks pass and Alex says OK, and use one commit per finished step with a clear message.
* Content accuracy. Do not invent results, metrics, dates, or statuses. "Submitted" is not "accepted." If a detail is missing, ask Alex.
* Privacy. Never publish a home address or phone number, on any page or in any PDF, including PDF metadata.
* Research material. Before posting figures, data, or text from unpublished or submitted manuscripts, Alex must confirm that his mentor or lab is fine with it.
* Henry Heffernan. The concept credit stays on the site. Do not copy code, models, or audio from his repositories.

## Phase 0: Set up the repo

1. The live repo is `Alex-Phu/alex-phu.github.io` on GitHub. It currently holds one commit (`b87f480`) with an older `index.html`. The files in this folder are newer.
2. Clone the repo, copy this folder's contents into it (`index.html`, `CLAUDE.md`, `HANDOFF.md`, `model/`, `tools/`), and add a `.gitignore` with `out/`, `__pycache__/`, `.DS_Store`, and `*.blend1`.
3. Commit as "Import site and tools from Claude session" and push once Alex confirms.

Done when: https://alex-phu.github.io shows the white office room, glowing objects, and the "Click anything that glows" hint after BOOT.

## Phase 1: Split the single file

Goal: same look and behavior, organized files. The base64 embedding only existed because claude.ai previews could not serve `.glb` files. GitHub Pages can.

Target layout:

```
index.html            page structure only
css/style.css         all styles
js/main.js            entry point (ES module): boot sequence, render loop
js/scene.js           renderer, model loading, camera, glow outlines, hotspots
js/os.js              AlexOS (3D monitor version and phone panel)
js/sound.js           Web Audio synthesis
data/projects.json    all card and OS text (Phase 2 fills this in)
assets/desk.glb       the baked model, loaded directly
tools/scene.py        Blender bake script
CLAUDE.md, HANDOFF.md
```

Steps:

1. Move the CSS and JS out of `index.html` without changing behavior. Keep three.js pinned at 0.160.0 through the import map.
2. Load `assets/desk.glb` with the normal `GLTFLoader.load`, and report real download progress on the BIOS screen.
3. Remove the base64 `<script type="text/plain">` blocks, `decodeDesk`, and `loadTextures`. Retire `tools/embed.py` and say so in `CLAUDE.md`.
4. Replace the old "simple shapes" fallback with a clear message on the BIOS screen if the model fails to load, including the contact email.
5. Update `CLAUDE.md` to match the new layout.

Done when: desktop and phone previews match the current site, with no console errors and a first load under about 4 MB.

## Phase 2: Content as data

1. Create `data/projects.json` as the single source for project cards and AlexOS windows. Suggested fields per project: `id`, `prefix` (the Blender object prefix, such as `kinetiq`), `title`, `tag`, `status`, `summary`, `tech`, `links`, `image`, and `page`.
2. Render the cards and the Research and Projects windows from that file, so adding a project means editing one JSON entry.
3. Move the About and Contact text into the same file or a small `data/site.json`.

Done when: changing a summary in the JSON changes it everywhere on the site.

## Phase 3: Show projects and research better

Alex wants visitors to understand his projects and research much better than a short card allows.

1. Ask Alex which two or three projects to start with, and collect screenshots, short demo videos, diagrams, and links from him.
2. Give each project a page at `projects/<id>.html` with a short overview, what he built, how it works (a simple diagram), the tools used, and results he has confirmed. Pages must work on phones and stand alone when shared as a link.
3. Add a "Read more" link on each card and in AlexOS that opens the project page.
4. For research (AskAAPM, the 3D-printed shield, VISTA-3D), keep to abstract-level descriptions and approved figures. See the research rule above.

Done when: each chosen project has a page, and the card and OS both link to it.

## Phase 4: Resume PDF

1. Get a resume PDF from Alex. It must not include his street address or phone number.
2. Check it before publishing: extract the text (for example with `pdftotext`) and search for anything that looks like a street address or phone number. Strip the PDF metadata.
3. Save it as `resume.pdf`, add a Resume window or icon in AlexOS, and add a link in the page header.

Done when: the resume opens from the site and the checks found no address or phone number.

## Phase 5: Custom domain (after Alex buys alexphu.com)

1. Add a `CNAME` file containing `alexphu.com`.
2. Walk Alex through his registrar's DNS screen: four A records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a CNAME for `www` pointing to `alex-phu.github.io`.
3. In GitHub, under Settings and then Pages, set the custom domain and turn on Enforce HTTPS once it is available.

Done when: https://alexphu.com loads the site with a valid certificate.

## Phase 6: Backlog (ask Alex before starting any of these)

* GPU baking. Help Alex run `python tools/scene.py out final gpu` on his Windows PC (RTX 5070 Ti, Python 3.13, `pip install bpy numpy pillow scipy`). This path is untested. Confirm the log says it baked on the GPU.
* Fast recolor. Add a mode to `scene.py` that re-bakes only the albedo pass and reuses the saved lighting, for color-only changes.
* Link previews. Add Open Graph and Twitter meta tags with a screenshot of the room, so shared links show an image.
* Plain page. Add a lightweight `plain.html` generated from `projects.json`, for screen readers, search engines, and slow devices, and link it from the BIOS screen.
* Room edits. New objects for new projects need a Blender object with a matching prefix in `scene.py`, a re-bake, and a JSON entry.
* Small known issues. Chess pieces look tinted when glowing. Keyboard and mouse are excluded from the glow on purpose.
