# Narraciones — Audiobook Player

Static audiobook player hosted on GitHub Pages. Audio files live on OneDrive; only the catalog and player code are in this repo.

---

## File structure

```
narraciones/
├── index.html        Main page
├── catalog.json      Book and chapter data — the only file you edit
├── css/style.css     All styling
├── js/app.js         All logic
└── README.md
```

---

## Publishing to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under *Branch*, select **main** and folder **/ (root)**.
4. Click **Save**.
5. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

---

## Local testing

Because the player uses `fetch()` to load `catalog.json`, you need a local HTTP server — opening `index.html` directly from the filesystem won't work in most browsers.

With XAMPP running, place this folder inside `htdocs/` and visit:

```
http://localhost/narraciones/
```

---

## Getting a shareable OneDrive link

1. Open OneDrive in your browser.
2. Right-click the audio file → **Share**.
3. Make sure the link is set to **Anyone with the link can view**.
4. Click **Copy link**.
5. Paste that URL as the value of `onedrive_url` in `catalog.json`.

The player automatically appends `?download=1` to make the URL streamable.

---

## Adding a chapter

Open `catalog.json`, find the right book, and append to its `chapters` array:

```json
{
  "id": "cap-03",
  "title": "Capítulo III",
  "title_en": "Chapter III",
  "duration": "27:05",
  "recorded": "2024-03",
  "onedrive_url": "https://1drv.ms/u/s!YOUR_SHARE_LINK"
}
```

---

## Adding a book

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
      "onedrive_url": "https://1drv.ms/u/s!YOUR_SHARE_LINK"
    }
  ]
}
```

The `id` must be unique across all books (it's used in the URL). Use lowercase letters, numbers, and hyphens only.

---

## catalog.json field reference

### Top level

| Field      | Type   | Description                        |
|------------|--------|------------------------------------|
| `narrator` | string | Narrator name shown in the header  |
| `books`    | array  | Array of book objects              |

### Book object

| Field            | Type   | Required | Description                                              |
|------------------|--------|----------|----------------------------------------------------------|
| `id`             | string | ✓        | URL-safe unique slug (e.g. `cien-anos-soledad`)          |
| `title`          | string | ✓        | Book title (Spanish or primary language)                 |
| `author`         | string | ✓        | Author full name                                         |
| `language`       | string | ✓        | Primary language code: `es`, `en`, etc.                  |
| `cover_color`    | string | ✓        | CSS color for the cover background (e.g. `#8B4513`)      |
| `description`    | string | ✓        | Short description in Spanish                             |
| `description_en` | string |          | Short description in English (shown when EN is active)   |
| `chapters`       | array  | ✓        | Array of chapter objects                                 |

### Chapter object

| Field          | Type   | Required | Description                                              |
|----------------|--------|----------|----------------------------------------------------------|
| `id`           | string | ✓        | Unique slug within the book (e.g. `cap-01`)              |
| `title`        | string | ✓        | Chapter title in Spanish                                 |
| `title_en`     | string |          | Chapter title in English (shown when EN is active)       |
| `duration`     | string |          | Display duration string, e.g. `32:14`                    |
| `recorded`     | string |          | Recording date, e.g. `2024-01`                           |
| `onedrive_url` | string | ✓        | OneDrive share link — paste it exactly as copied         |
