# DeshBrain BD v2.2 Revision Audit

## User-requested change

Make Desh AI and Asol Dam able to use fresh Google search results instead of relying only on demo/community data, while keeping the application usable if Google or the external AI provider is unavailable.

## Implemented

1. Added `src/googleSearch.js`.
   - Official Google Custom Search JSON endpoint.
   - API key + Search Engine ID configuration.
   - Bangladesh-biased search (`gl=bd`).
   - Five-minute default cache.
   - Structured/snippet price extraction.
   - Banglish product aliases.

2. Added `src/googleRoutes.js`.
   - Google Maps Routes `computeRoutes` REST integration.
   - `TRAFFIC_AWARE` / `TRAFFIC_AWARE_OPTIMAL` routing.
   - Live duration, static duration, traffic delay, distance, traffic label.
   - Simple English/Bangla/Banglish route extraction for Desh AI.

3. Updated `/api/chat`.
   - Fetches Google evidence when the question is current/price/web-seeking.
   - Fetches Google Maps route when origin and destination are extractable.
   - Passes evidence into the external LLM when configured.
   - Passes the same evidence into local fallback when no LLM is configured.
   - Adds response headers indicating Google grounding.

4. Added endpoints.
   - `GET /api/web/search?q=...&kind=price|general`
   - `GET /api/route/live?origin=...&destination=...`

5. Updated Asol Dam.
   - `Compare + Live Web` searches Google-indexed web results.
   - Displays clickable source cards.
   - Shows extracted visible price only when evidence contains a numeric price.
   - Does not invent missing prices.

6. Updated Road Brain.
   - Analyze route timing uses Google Maps Routes API when configured.
   - Graceful fallback message when it is not configured.

7. Updated Desh AI rendering.
   - Markdown source links are clickable.
   - Response metadata indicates Google web grounding and/or Google Maps live traffic.

8. Updated diagnostics.
   - `/healthz` reports Google Search and Google Routes connection state.
   - `/api/meta` exposes live-service configuration to the UI.

## Key consistency rule

The product never labels Google Search as a guaranteed real-time retailer database. It labels it as fresh Google-indexed web evidence. Google Maps Routes traffic-aware ETA is separately identified as live traffic routing data.
