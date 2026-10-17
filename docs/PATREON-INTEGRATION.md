# Patreon integration plan

This plan covers discovering Sims 4 creators and posts on Patreon, including public posts and posts a signed-in user is entitled to view. It does not authorize scraping, copying paid files, or bypassing a creator's access rules.

## Product behavior

- Discover has a manually curated directory of Patreon creators who make Sims 4 content. There is no general creator-search endpoint documented by Patreon, so the first directory is an allowlist maintained by SimmerSpace.
- Each creator and each post gets its own game tags. A multi-game creator can appear for a Sims 4 post while posts tagged only for inZOI, Paralives, or another game stay out of Sims 4 results.
- Public Discover results show only posts the approved API confirms as public (`is_public: true`). Because Patreon separately marks pay-per-post content with `is_paid`, treat `is_paid: true` as gated until Patreon confirms how it should be handled; never promise it is free based on visibility alone. A Patreon link opens the original post on Patreon.
- Creator participation and patron account linking are separate, optional flows. A creator who joins the catalog authorizes SimmerSpace to use their campaign data; a patron links their account so SimmerSpace can check that person's current membership. SimmerSpace may show member-only content only if Patreon confirms entitlement and the API/client is allowed to retrieve and display it. Otherwise, show an “Open on Patreon” link, where the user can access it in Patreon, or omit it.
- SimmerSpace never hosts or redistributes a creator's paid file. Any download/install flow must follow the creator's intended delivery and Patreon’s API and content terms.

## What the current API documentation establishes

- Build against API v2. Patreon says API v1 stopped responding on October 7, 2026.
- The v2 identity endpoint can return a user's memberships with the `identity.memberships` scope. This is membership information; it is not, by itself, documented as permission to read every creator's posts.
- Listing a campaign's posts requires `campaigns.posts`. Patreon describes campaigns as belonging to the authorized user, and tells apps that need campaign or pledge data for other users to contact the developers forum. Do not assume that a patron's OAuth token permits access to a creator's campaign posts.
- Patreon describes multi-creator integrations as keeping creator/member relationships on the server. Its OAuth guide distinguishes a single-creator flow from a multi-creator product; the exact authorization needed for SimmerSpace's third-party campaigns still needs confirmation from Patreon.
- Post data includes `is_public`, `tiers`, `title`, `url`, and `content`. The app must rely on Patreon’s access result and the user's current entitlement; it must never infer entitlement from a creator name, a tier label, or a manually entered profile.
- Patreon documents the OAuth code exchange and token storage as server-side work. A client secret must never be placed in Electron renderer code, a desktop executable, or this repository.
- The API reference does not document a public, cross-creator search/index endpoint. Maintain a curated Sims 4 creator list instead of crawling Patreon.

## Gates before live integration

1. Register a Patreon API v2 client and contact the Patreon developers forum to request written confirmation for this exact multi-creator use case: creators opt in to listing their Sims 4 campaigns; patrons optionally connect to verify their memberships; SimmerSpace lists public posts and links entitled members to Patreon.
2. Confirm the creator-side authorization needed to read each campaign, the patron-side OAuth scopes needed to verify memberships across campaigns, whether the multi-creator app needs to be reviewed/listed in Patreon's App Directory, and which fields, previews, images, post text, and download links SimmerSpace may display or retain.
3. Confirm Patreon’s requirements for app review, public listing, privacy disclosures, rate limits, caching/retention, attribution, revocation, and use of post media. Do not ship an API-backed feature until these answers are clear.
4. Decide on the OAuth/token architecture. Patreon documents the code exchange on a server and the desktop app must not contain the client secret. Use a backend only if its security, hosting, and privacy costs are acceptable; otherwise keep the feature at manual public links.

## Implementation stages

### Stage 1 — Curated directory, no API

Keep the current manually added Patreon profile feature. Extend the content model only when needed to store curator-entered game tags and Sims 4 categories. Provide a reviewable list of accepted creators, their official profile links, and the specific Sims 4 content areas they make. Do not fetch Patreon pages or represent demo data as live posts.

### Stage 2 — Public post discovery, after approval

Use only an approved API v2 path to retrieve posts for creator-connected campaigns. Include an item in public Discover only when Patreon reports `is_public: true` and the post is not marked `is_paid: true` (or Patreon has explicitly confirmed a safe rule for that case). Filter by the post's Sims 4 game tag, not merely the creator's overall profile tags. Preserve a link to the original Patreon post, show the source and access label, and follow approved retention and refresh limits.

### Stage 3 — Creator onboarding, after approval

Let a creator voluntarily connect their Patreon campaign to SimmerSpace. Use the creator authorization to associate the campaign ID with the creator's reviewed Sims 4 catalog profile and retrieve posts only through the approved API scopes. Store creator tokens securely on the backend, isolate each campaign's data, and support disconnecting the creator. A profile manually added by a SimmerSpace user is not consent to fetch that creator's posts.

### Stage 4 — Optional patron linking, after approval

Add a clearly optional “Link Patreon” flow with the minimum approved scopes; do not request email unless a separate feature needs it. Verify the current membership and entitled tier server-side where required. Keep tokens out of the renderer, logs, source tree, and packaged app. Provide unlink/revoke handling and clear stored authorization data when the user disconnects.

### Stage 5 — Entitled post access, only if explicitly approved

Test public, free-member, paid-tier, expired, declined, and revoked membership cases. Fail closed whenever the API cannot verify entitlement. Prefer opening Patreon for the post and its delivery; only display post body or media inside SimmerSpace if Patreon has explicitly approved that presentation and retention.

## Current status

The prototype has local manual Patreon profile links and a local follow list. It does not connect to Patreon, discover posts, link accounts, verify memberships, or unlock content. No credentials or API secrets belong in the repository or desktop bundle.

## Official references

- [Patreon API v2 reference](https://docs.patreon.com/)
- [Patreon OAuth and API scopes](https://docs.patreon.com/#oauth)
- [Patreon platform quick start](https://www.patreon.com/portal/start/quick-start)
- [Patreon information about third-party app permissions](https://support.patreon.com/hc/en-us/articles/115004061726-What-information-do-third-party-apps-receive-about-my-Patreon-account)
