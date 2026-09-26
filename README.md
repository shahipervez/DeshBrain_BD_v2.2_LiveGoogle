# DeshBrain BD v2.2 — Live Web + Live Traffic

DeshBrain combines three Bangladesh-focused modules:

- **Road Brain** — community road signals, fair-fare estimates, and optional Google Maps live-traffic ETA.
- **Asol Dam** — community price observations plus fresh Google-indexed shopping/product sources.
- **Desh AI** — Bangla, English, and Banglish chat with Quick / Balanced / Deep modes, saved conversations, optional LLM provider, Google web grounding, and a local fallback brain.

## What v2.2 adds

- Google Programmable Search integration for fresh web evidence.
- Google Maps Routes API integration for traffic-aware live route ETA.
- Banglish product understanding such as `kacha morich er price koto?`.
- Fresh web source cards in Asol Dam.
- Source links in Desh AI responses.
- Google Search failure never breaks the app; local/community fallback remains available.
- Google Routes failure never breaks Road Brain; community ETA remains available in Desh AI.
- `/healthz` and `/api/meta` expose which live services are configured.

## Important accuracy note

**Google Search is fresh indexed web evidence, not a guaranteed real-time store database.** A supermarket can change a shelf or checkout price before Google re-indexes its page. DeshBrain therefore labels these results as Google-indexed web evidence and links to the source page for verification.

For route questions, the optional Google Maps **Routes API** uses traffic-aware routing and can provide live-traffic ETA when configured.

## Quick start (Windows PowerShell / VS Code)

```powershell
Copy-Item .env.example .env
npm install
npm run check
npm run dev
```

Open:

```text
http://localhost:3000
```

The project works without Google keys in fallback/demo mode.

---

# Enable Google live web search

## 1. Create a Google Cloud project

Open Google Cloud Console and create/select a project.

## 2. Create a Programmable Search Engine

Create a Google Programmable Search Engine and configure it to search the **entire web** if that is what you want Desh AI to use. Copy the Search Engine ID (`cx`).

Official product documentation:

```text
https://developers.google.com/custom-search/v1/overview
https://programmablesearchengine.google.com/
```

## 3. Enable Custom Search JSON API and create an API key

Create an API key in Google Cloud and restrict it to the Custom Search API where possible.

Then edit `.env`:

```env
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_CX=your_search_engine_id
GOOGLE_SEARCH_MODE=auto
```

`GOOGLE_SEARCH_MODE` values:

- `auto` — searches Google for current/live/price queries.
- `always` — uses Google search for every Desh AI question (uses more quota).
- `off` — disables Google web grounding.

Restart the server after changing `.env`.

## Google search test

Open:

```text
http://localhost:3000/api/web/search?q=kacha%20morich%20price&kind=price
```

You should receive JSON with `source: "Google Programmable Search"` and current indexed results.

In Desh AI try:

```text
kacha morich er price koto?
```

or

```text
Shwapno te soybean oil 2 litre er current price koto?
```

Desh AI will use Google-indexed sources when credentials are configured. If a result exposes a price in structured metadata or its search snippet, DeshBrain extracts it; otherwise it gives source links without inventing a number.

---

# Enable Google Maps live traffic

Enable the **Routes API** in Google Cloud and ensure billing is configured for the Maps Platform project.

Official documentation:

```text
https://developers.google.com/maps/documentation/routes/compute_route_directions
```

Add to `.env`:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_key
```

Restart the server.

Test:

```text
http://localhost:3000/api/route/live?origin=Uttara&destination=Dhanmondi
```

Expected fields include:

- `durationMinutes` — traffic-aware ETA.
- `staticDurationMinutes` — baseline/historical ETA.
- `delayMinutes` — estimated current traffic delay.
- `distanceKm`.
- `traffic` — normal / moderate / heavy.
- `source: "Google Maps Routes API"`.

Then ask Desh AI:

```text
Uttara theke Dhanmondi jete ekhon koto time lagbe?
```

or use **Road Brain → Analyze route timing**.

---

# Optional external AI model

The app does not require an external LLM. With no AI key, the local brain still answers domain questions and formats Google/Routes evidence.

To connect an OpenAI-compatible chat-completions provider:

```env
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=your_key
AI_MODEL=your_current_model_id
```

When configured, Desh AI gives the model the community data plus Google web/route evidence and instructs it not to fabricate live facts.

---

# Useful tests

### Banglish price

```text
kacha morich er price koto?
```

### Store-specific current price

```text
Shwapno te soybean oil er current price koto?
```

### Live route

```text
Uttara theke Dhanmondi jete ekhon koto time lagbe?
```

### Combined query

```text
Ami Uttara theke Bashundhara jabo soybean oil kinte. Live traffic, travel time, CNG fare ar current web price ekshathe bolo.
```

### General current web query

```text
Google e search kore Bangladesh er latest dengue update bolo.
```

---

# Production notes

Before public deployment:

1. Use PostgreSQL (`DEMO_MODE=false`) so accounts and chat history persist.
2. Replace `SESSION_SECRET` with a long random secret.
3. Restrict Google API keys by API, referrer/IP/server as appropriate.
4. Add quotas and budget alerts in Google Cloud.
5. Keep `GOOGLE_SEARCH_CACHE_MS` enabled to reduce duplicate queries and quota usage.
6. Load-test the deployed environment; local syntax checks do not prove 1,000 concurrent-user capacity.
7. For truly real-time supermarket inventory/checkout prices, integrate an official retailer API/feed or partnership. Google search is not a replacement for a retailer database.

## Health endpoint

```text
http://localhost:3000/healthz
```

Example:

```json
{
  "ok": true,
  "googleSearch": true,
  "googleRoutes": true,
  "mode": "demo",
  "database": "memory"
}
```
