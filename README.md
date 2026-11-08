# 🍲 Dinner Planner

Weekly dinner planning (Monday–Friday) from your own recipe collection.

- **Weeks**: this week and next week side by side, for each day the dinner (click it for details), the headcount and the snacks.
- **Plan**: choose *This week* or *Next week* at the top. For each day you can switch dinner on or off, narrow the choice by tags and/or a minimum rating, and press **Go**. Then reshuffle or pick manually per day, and adjust people and snacks.
  Suggestions never repeat a recipe within the same week or from the neighbouring week. A manual choice can override this, and the app shows a warning when it does.
- **Recipes**: title, link, description, tags, 1–5 star rating, active/inactive. You can search, filter by tag and sort.
- **Settings**: manage tags (add, rename, delete).

Default headcount: 2 adults every day, plus 1 small kid on Mon/Tue, plus 1 big kid and 1 small kid on Wed/Thu. You can change it per day.

## How it works

- The **page** is hosted on GitHub Pages (code only).
- The **data** (recipes, plans, tags) lives in a JSON file in Google Drive, served by a small
  Google Apps Script ([`backend/Code.gs`](backend/Code.gs)).
- **Anyone with the link can view and edit**, with no login and no key. Changes are visible to everyone right away,
  and nobody needs to commit anything.
- If two people save at the same moment, the page loads the newest version and applies its own change again, so nothing gets lost.
- Once a day the previous state is copied to the Drive folder *Dinner Planner backups* (kept for 60 days).

> Anyone who knows the page link can change the data. Share the link only with the people who should use it.

## Setup (once)

### 1. Shared storage (Google, ~5 minutes)

1. Go to <https://script.google.com> → **New project**, name it "Dinner Planner".
2. Replace the content of `Code.gs` with [`backend/Code.gs`](backend/Code.gs) and save.
3. **Deploy → New deployment** → type **Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - **Deploy**, then allow access (Google asks once, because the script creates a file in your Drive).
4. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
5. Paste it into [`config.js`](config.js):
   ```js
   window.DINNER_API_URL = 'https://script.google.com/macros/s/…/exec';
   ```

If you change `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version**.
That keeps the URL the same.

### 2. Website (GitHub Pages)

1. Create a **public** GitHub repository (e.g. `dinner-planner`) and push this folder to `main`.
2. Repository **Settings → Pages**: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute the site is live at `https://<owner>.github.io/<repo>/`. Share that link.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. With an empty `DINNER_API_URL` it runs in *local mode* (data only in that browser, seeded from `data/db.json`).
