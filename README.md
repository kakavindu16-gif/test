# 🎬 CineSubz API

**Live API:** `https://test-production-9eda.up.railway.app`

---

## 1. Search Movies / TV Shows — `GET /search`

```powershell
# Example 1: Searching for 'nobody'
Invoke-RestMethod -Uri "https://test-production-9eda.up.railway.app/search?q=nobody"
```

```json
[
  {
    "index": 1,
    "title": "Nobody (2021) Sinhala Subtitles | සිංහල උපසිරැසි සමඟ",
    "url": "https://cinesubz.lk/movies/nobody-2021-sinhala-subtitles/",
    "thumbnail": "https://cinesubz.lk/wp-content/uploads/2025/08/oBgWY00bEFeZ9N25wWVyuQddbAo.jpg"
  }
]
```

```powershell
# Example 2: Searching for 'Game of Thrones'
Invoke-RestMethod -Uri "https://test-production-9eda.up.railway.app/search?q=Game+of+Thrones"
```

```json
[
  {
    "index": 1,
    "title": "Game of Thrones (2011) Complete TV Series With Sinhala Subtitles | සිංහල උපසිරැසි සමඟ",
    "url": "https://cinesubz.lk/tvshows/game-of-thrones-2011-sinhala-subtitles/",
    "thumbnail": "https://cinesubz.lk/wp-content/uploads/2021/08/MV5BYTRiNDQwYzAtMzVlZS00NTI5LWJjYjUtMzkwNTUzMWMxZTllXkEyXkFqcGdeQXVyNDIzMzcwNjc@._V1_.jpg"
  }
]
```

---

## 2. Get Details (Movies) — `GET /details`

Pass the URL obtained from the search API to get full details including direct download links.

```powershell
# Getting details for Nobody (2021)
Invoke-RestMethod -Uri "https://test-production-9eda.up.railway.app/details?url=https://cinesubz.lk/movies/nobody-2021-sinhala-subtitles/"
```

```json
{
  "title": "Nobody (2021)",
  "thumbnail": "https://image.tmdb.org/t/p/w780/uWeffFhprUohUL5GO3YfQqdsVrI.jpg",
  "imdb": "tt7888964",
  "duration": "91 min",
  "year": "2021",
  "siteRating": "8.5",
  "downloads": [
    {
      "quality": "480p • 550 MB • English",
      "url": "https://cinesubz.lk/api-rwjdzuehbdrwjdzuehbdzjyvxo2bhh0azjyvxo2bhh0auehbdruehbdrwjdzuehbdzjyvxo2bhh0azjyvxo2bhh0auehbdrwjdzuehbwjdzuehbdzjyvxo2bhh0azjyvxo2bhh0a/qnutnfdbon/"
    },
    {
      "quality": "720p • 1.1 GB • English",
      "url": "https://cinesubz.lk/api-rwjdzuehbdrwjdzuehbdzjyvxo2bhh0azjyvxo2bhh0auehbdruehbdrwjdzuehbdzjyvxo2bhh0azjyvxo2bhh0auehbdrwjdzuehbwjdzuehbdzjyvxo2bhh0azjyvxo2bhh0a/wo8liklchx/"
    }
  ],
  "episodes": []
}
```

---

## 3. Get Details (TV Shows)

For TV Shows, getting details is a two-step process.
First, fetch the TV show page to get the full list of **Episodes**. Then, fetch the specific Episode page to get its **Downloads**.

### Step 3.1: Get All TV Show Episodes
```powershell
# Getting episodes list for a TV Show (e.g. Game of Thrones)
Invoke-RestMethod -Uri "https://test-production-9eda.up.railway.app/details?url=https://cinesubz.lk/tvshows/game-of-thrones-2011-sinhala-subtitles/"
```

```json
{
  "title": "Game of Thrones (2011) Complete TV Series",
  "year": "2011",
  "downloads": [],
  "episodes": [
    {
      "title": "S01E01 - Winter Is Coming Apr. 17, 2011",
      "url": "https://cinesubz.lk/episodes/game-of-thrones-s01-e01/"
    },
    {
      "title": "S01E02 - The Kingsroad Apr. 24, 2011",
      "url": "https://cinesubz.lk/episodes/game-of-thrones-s01-e02/"
    }
  ]
}
```

### Step 3.2: Get Episode Downloads
```powershell
# Pass the Episode URL to the same /details endpoint to get its download links
Invoke-RestMethod -Uri "https://test-production-9eda.up.railway.app/details?url=https://cinesubz.lk/episodes/game-of-thrones-s01-e01/"
```

```json
{
  "title": "Game of Thrones: Winter Is Coming",
  "downloads": [
    {
      "quality": "480p • 300 MB • English",
      "url": "https://cinesubz.lk/zt-links/abc123def4/"
    },
    {
      "quality": "720p • 700 MB • English",
      "url": "https://cinesubz.lk/zt-links/xyz987uvw1/"
    }
  ],
  "episodes": []
}
```

---

## 4. Get Direct Download URLs — `POST /direct-url`

Convert a `cinesubz.lk/zt-links/` or `cinesubz.lk/api-...` URL into the final direct download link (e.g., Google Drive or bot3.sonic-cloud server).

```powershell
$body = @{ url = "https://cinesubz.lk/zt-links/abc123def4/" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://test-production-9eda.up.railway.app/direct-url" -Method Post -Body $body -ContentType "application/json"
```

```json
{
  "directUrl": "https://bot3.sonic-cloud.online/server6/202601/Game.of.Thrones.S01E01.English.BluRay-%5BCineSubz.co%5D-720p?ext=mp4"
}
```
