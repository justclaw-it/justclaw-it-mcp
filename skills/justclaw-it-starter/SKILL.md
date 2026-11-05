---
name: justclaw-it-starter
description: (JustClaw-It Pro) Compose a new starter project from real, licence-cleared components, e.g. "Next.js SaaS with auth, Stripe billing and email" or "FastAPI service with JWT and Postgres". Use it when the user asks to scaffold or bootstrap a new app.
homepage: https://justclaw.it.com
---

# JustClaw-It starter (Pro)

## Requires

The `compose_starter` tool on the `justclaw-it` MCP server. It is only available on a Pro key and costs 10 credits per call. If the tool is missing from your tool list, or the call is refused because the key isn't Pro:
- tell the user it needs JustClaw-It Pro (https://justclaw.it.com/pricing);
- offer the free path instead: `justclaw-it-search` for each piece, then `justclaw-it-pull`.

## Steps

1. **Pin down the brief.** Get the stack (language, framework, database) and the features (auth, billing, email, uploads, admin, etc.). Ask at most one clarifying question. Otherwise pick mainstream defaults and say which ones.
2. **Compose.** Call `compose_starter` with:
   - `prompt`: one paragraph on what is being built and the features it needs;
   - `stack` (optional): for example `"nextjs"` or `"python fastapi"`.

   It returns a starter assembled from 3–8 complementary components: a file tree, the files with attribution headers, a README listing every source and licence, a NOTICE, and install commands.
3. **Review before writing.** Show the user the file tree, the components it chose (repo, licence), and any copyleft or unlicensed pieces. Swap out copyleft pieces unless the user's project licence allows them.
4. **Write the project.**
   - Create it in a new directory, or in the current one only if it's empty.
   - Keep every attribution header, the README's credits section and the NOTICE file.
   - Add `.env.example` with every env var the code reads.
5. **Make it run.** Run the install commands it returned, then the build or typecheck and the tests. Fix the glue between components until it runs. The components come from different repos, so expect small mismatches.
6. **Hand off.** Give the user the start command, the env vars to fill in, and the component list.

Don't call `compose_starter` repeatedly to fish for a better result. Sharpen the brief once, or adjust the pieces yourself with `justclaw-it-search` and `justclaw-it-pull`.
