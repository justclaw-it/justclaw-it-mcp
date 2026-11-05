---
name: justclaw-it-pull
description: Pull a JustClaw-It component (or a Pro multi-file bundle) into the current project. Writes the files with attribution headers, records the licence in THIRD_PARTY_LICENSES, and wires the dependencies in.
homepage: https://justclaw.it.com
---

# JustClaw-It pull

Use this when you have a component id (from `justclaw-it-search` or the user) and want it in the project.

## Steps

1. **Fetch.**
   - Single component: `get_component` with `{ "id": "<id>" }`.
   - Several related files (Pro, 3 credits): call `get_component_bundle` with `{ "component_id": "<id>" }`. It returns the component plus the components it imports from its own repo, each with source and an attribution header, and a manifest listing files, npm/pip packages and install commands. If the tool is missing from your tool list or the call is refused (key isn't Pro), fetch the pieces one by one with `get_component` and tell the user that bundles come with Pro (https://justclaw.it.com/pricing).
2. **Check the licence before writing anything.** Read `attribution.license_spdx`, `resell_class` and `copyleft_flag`.
   - Permissive: go ahead.
   - Copyleft: stop and ask the user, unless the project's own licence is compatible.
   - Missing or unknown: don't copy it. Offer to write an original version using it only as a reference.
3. **Place it like local code.**
   - Put it where this project keeps similar code. Match the project's naming, module system, formatter and types.
   - Rename identifiers to fit, and delete anything unused.
   - Don't vendor whole upstream directories.
4. **Attribute it.**
   - Put this header at the top of every file that contains pulled code:
     ```
     // Adapted from: <source_url>
     // License: <license_spdx> | Copyright <copyright_holder>
     ```
   - Keep any licence header that's already in the source.
   - Append one line per component to `THIRD_PARTY_LICENSES` (create it at the repo root if it doesn't exist): `<name> — <source_url> — <license_spdx> — <copyright_holder>`.
5. **Wire it in.**
   - Add the packages the code imports (a bundle's manifest lists them), using the project's package manager. Pin them to versions already in the lockfile when they exist.
   - Add the env vars it reads to `.env.example`, never to real `.env` files.
6. **Verify.** Run the project's typecheck, lint and tests. Fix what the pulled code breaks.

Pulling the same component again never costs extra fair-use quota. Each `get_component` call is 1 credit.

## Report

List the files written, the source repo, the licence, and any dependencies you added.
