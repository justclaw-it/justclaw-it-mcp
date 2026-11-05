---
name: justclaw-it-search
description: Before writing a common component (auth, payments, webhooks, uploads, UI widgets, API clients, CLI helpers), search the JustClaw-It registry for a real, quality-scored, licence-cleared implementation and pick the best one.
homepage: https://justclaw.it.com
---

# JustClaw-It search

Use the `justclaw-it` MCP server (tool names may be prefixed, e.g. `mcp__justclaw-it__search_components` in Claude Code). If its tools are missing, tell the user to run `npx @justclaw-it/cli init`.

## When

Search **before** you write anything a thousand projects already have: auth middleware, OAuth flows, Stripe/webhook handlers, rate limiters, file uploads, email senders, retry/backoff, data tables, form components, API clients, scrapers, CLI scaffolds. Skip it for code that is specific to this project's business logic.

## How

1. Call `search_components` with a short, concrete query naming the job and the stack: `"express jwt auth middleware"`, `"react drag and drop file upload"`, `"python stripe webhook signature verify"`.
   - `limit`: 5 is enough. Each search costs 1 credit.
   - `category` narrows it (e.g. `auth`, `payments`, `ui`, `database`, `email`, `cli`, `testing`, `security`).
   - `min_composite`: set `6` to see only well-scored code.
2. Pick one result:
   - **Fit first**: same language and framework (`tags` like `fw:express`), similar scope, `similarity` ≥ 0.75.
   - **Then quality**: higher `scores.composite` (0–10) wins. A null score means unscored, not bad; read it before trusting it.
   - **Then licence** (`attribution`):
     - `resell_class: permissive` (MIT, Apache-2.0, BSD, ISC): use freely.
     - `copyleft_flag: true` (GPL, AGPL, LGPL, MPL): only if the project is already under a compatible licence. Otherwise tell the user and pick a permissive result.
     - No licence or unknown: don't copy it. Use it as a reference only.
3. Call `get_component` with the result `id` to get the full source. Read it, then adapt it to this codebase's conventions.
4. Don't search the same thing twice in one task. Reuse the results you already have.

## Attribution (always)

Keep a header comment above any code you take from a component, even when you change it heavily. Use the `attribution.text` the tool returns:

```
// Adapted from: <source_url>
// License: <license_spdx> | Copyright <copyright_holder>
```

Never strip or shorten an existing licence header in the fetched source. For permissive licences, also make sure the project ships the licence notice (a `NOTICE` or `THIRD_PARTY_LICENSES` file). `list_licenses` returns the full attribution list.

## Tell the user

In one line, name the component you used, its repo, licence and score, so they can veto it.
