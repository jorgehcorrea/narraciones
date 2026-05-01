# Narraciones — Audiobook Player

Static audiobook player hosted on **Vercel** at [narraciones.vercel.app](https://narraciones.vercel.app).  
Audio files live on OneDrive; only the catalog and player code are in this repo.

---

## File structure

```
narraciones/
├── index.html              Main page
├── catalog.json            Book and chapter data — the only file you edit regularly
├── css/style.css           All styling
├── js/app.js               All player logic
├── api/
│   └── audio.js            Vercel serverless function — proxies OneDrive audio
├── generate-links.ps1      Script to generate OneDrive sharing links
├── vercel.json             Vercel deployment config
└── README.md
```

---

## How audio streaming works

Audio files are stored in **OneDrive** (`Documents/Sound recordings/`). Because OneDrive personal files are hosted on SharePoint Online, sharing links can't be used directly as audio sources in the browser.

The `/api/audio` serverless function solves this:
1. Browser requests `/api/audio?u={encoded-sharing-url}`
2. Function uses a stored refresh token to get a fresh Graph API access token
3. Function calls the Graph API to get a pre-authenticated CDN download URL
4. Returns a `302` redirect to `my.microsoftpersonalcontent.com/...`
5. Browser streams the audio directly from Microsoft's CDN

---

## Adding a new recording

1. **Drop the `.m4a`** into the correct OneDrive subfolder  
   (`Documents/Sound recordings/Book Name/chapter.m4a`)

2. **Run `generate-links.ps1`** from PowerShell to authenticate and generate the sharing link:
   ```powershell
   powershell -ExecutionPolicy Bypass -File generate-links.ps1
   ```
   Follow the browser sign-in prompt, then the script patches `catalog.json` automatically.

3. **Edit `catalog.json`** if the chapter wasn't picked up automatically — add it manually (see *Adding a chapter* below).

4. **Push to GitHub** — Vercel redeploys automatically:
   ```bash
   git add catalog.json
   git commit -m "add chapter: Chapter Name"
   git push
   ```

---

## Adding a chapter manually

Open `catalog.json`, find the right book, and append to its `chapters` array:

```json
{
  "id": "cap-03",
  "title": "Capítulo III",
  "title_en": "Chapter III",
  "duration": "27:05",
  "recorded": "2024-03",
  "onedrive_url": "https://1drv.ms/u/c/YOUR_SHARE_LINK"
}
```

To get the `onedrive_url`, run `generate-links.ps1` — it will fill this in automatically for all files it finds in OneDrive.

---

## Adding a new book

Append a new object to the `books` array in `catalog.json`:

```json
{
  "id": "unique-slug",
  "title": "Título del libro",
  "author": "Nombre del autor",
  "language": "es",
  "cover_color": "#4A235A",
  "description": "Descripción en español.",
  "description_en": "Description in English.",
  "chapters": [
    {
      "id": "cap-01",
      "title": "Capítulo I",
      "title_en": "Chapter I",
      "duration": "35:00",
      "recorded": "2024-06",
      "onedrive_url": "https://1drv.ms/u/c/YOUR_SHARE_LINK"
    }
  ]
}
```

The `id` must be unique across all books. Use lowercase letters, numbers, and hyphens only.  
Then run `generate-links.ps1` and add the new folder/files to the file map inside the script.

---

## Refreshing the OneDrive token

The `ONEDRIVE_REFRESH_TOKEN` stored in Vercel expires after **90 days of inactivity**. If audio stops playing:

1. Run `generate-links.ps1` — it will re-authenticate and save a new refresh token to `%TEMP%\od_refresh.txt`
2. Copy the new token from that file
3. Go to **[Vercel → narraciones → Settings → Environment Variables](https://vercel.com/jorgehcorrea/narraciones/settings/environment-variables)**
4. Update `ONEDRIVE_REFRESH_TOKEN` with the new value
5. Redeploy (Vercel → Deployments → Redeploy)

---

## Local testing

Because the player uses `fetch()` to load `catalog.json`, you need a local HTTP server.

With XAMPP running, visit:
```
http://localhost/narraciones/
```

> Note: `/api/audio` won't work locally without running the Vercel dev server (`npx vercel dev`). For local testing, you can temporarily revert `toStreamURL` in `js/app.js` to append `?download=1` instead.

---

## Vercel deployment

The site auto-deploys from the `main` branch on every push.

Required environment variables (set in Vercel project settings):

| Variable | Description |
|---|---|
| `ONEDRIVE_CLIENT_ID` | Microsoft Graph app client ID |
| `ONEDRIVE_REFRESH_TOKEN` | Long-lived token for Graph API access |

To set up a fresh deployment on a new Vercel account:
1. Import `jorgehcorrea/narraciones` from GitHub
2. Framework: **Other**, Build command: *(empty)*, Output: `.`
3. Add the two environment variables above
4. Deploy

---

## catalog.json field reference

### Top level

| Field      | Type   | Description                       |
|------------|--------|-----------------------------------|
| `narrator` | string | Narrator name shown in the header |
| `books`    | array  | Array of book objects             |

### Book object

| Field            | Type   | Required | Description                                            |
|------------------|--------|----------|--------------------------------------------------------|
| `id`             | string | ✓        | URL-safe unique slug (e.g. `el-camino-del-guerrero`)   |
| `title`          | string | ✓        | Book title                                             |
| `author`         | string | ✓        | Author full name                                       |
| `language`       | string | ✓        | Primary language code: `es`, `en`, etc.                |
| `cover_color`    | string | ✓        | CSS hex color for the cover (e.g. `#8B4513`)           |
| `description`    | string | ✓        | Short description in Spanish                           |
| `description_en` | string |          | Short description in English                           |
| `chapters`       | array  | ✓        | Array of chapter objects                               |

### Chapter object

| Field          | Type   | Required | Description                                    |
|----------------|--------|----------|------------------------------------------------|
| `id`           | string | ✓        | Unique slug within the book (e.g. `cap-01`)    |
| `title`        | string | ✓        | Chapter title in Spanish                       |
| `title_en`     | string |          | Chapter title in English                       |
| `duration`     | string |          | Display duration string, e.g. `21:57`          |
| `recorded`     | string |          | Recording date, e.g. `2024-03`                 |
| `onedrive_url` | string | ✓        | OneDrive share link (filled by generate-links.ps1) |
