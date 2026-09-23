# School Todos

A small offline-first todo PWA for tracking schoolwork by class. Plain HTML/CSS/JS — no build step.

- Classes (create, rename, recolor, reorder, delete)
- Todos with importance 1–5, due date, and notes
- Per-class **Active / Completed** tabs, with undo
- **All classes** view grouped by Overdue / Today / Tomorrow / This week / Later
- **Calendar view** (toggle in the top bar) — month grid with a dot per due date, tap a day to see and add todos due then
- Sort (due date, importance, newest) and filter by importance
- Data stays on the device (`localStorage`); export/import a JSON backup from the ⚙️ sheet

## Run locally

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Deploy to GitHub Pages

1. Create a new **public** repo on github.com (e.g. `school-todos`), without a README.
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "School Todos PWA"
   git branch -M main
   git remote add origin https://github.com/<your-username>/school-todos.git
   git push -u origin main
   ```

3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute your app is at `https://<your-username>.github.io/school-todos/`.

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch it from the home-screen icon. It runs full-screen and works offline.

> Todos saved in the home-screen app are separate from todos saved in a Safari tab, so always use the icon.

## Updating the app

After changing any file, bump `VERSION` in `sw.js` (e.g. `'v2'`), then commit and push. The next time you open the app while online, it loads the new version and caches it for offline use.

## Icons

`icons/make_icons.py` regenerates the PNG icons (requires Pillow).
