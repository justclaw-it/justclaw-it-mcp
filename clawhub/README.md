# ClawHub packaging

The three skills in `../skills/` are published to ClawHub as standalone skills, so OpenClaw users can run:

```sh
openclaw skills install justclaw-it-search
```

The skills need the `justclaw-it` MCP server configured, because it carries the user's API key. `npx @justclaw-it/cli init` does that and installs the skills in one go. The ClawHub listing is the discovery path.

## Publish (maintainers)

```sh
npm i -g clawhub
clawhub login
./clawhub/publish.sh                                # dry run: "Would publish justclaw-it-search@1.0.0" etc.
CLAWHUB_OWNER=<org-handle> ./clawhub/publish.sh --publish
```

- New skills start at `1.0.0`. Later runs publish the next patch, and unchanged skills are skipped.
- Categories `development,research`; topics are set per skill in `publish.sh`.
- Run it from a clean checkout of `main`, so the source commit recorded on ClawHub is the public one.
