# scallapi panel

The admin panel for [scallapi](https://github.com/sbga-tech/scallapi). It manages credentials, endpoint routes, models, quota, plugins, logs and settings through scallapi's v8 management API. The interface is in Chinese and English.

The build is a single `index.html`. scallapi serves it as `management.html`, downloading it from this repository's latest release when `management.panel-github-repository` points here.

## Development

```sh
bun install
SCALLAPI_URL=http://127.0.0.1:8317 bun run dev
```

The dev server proxies `/v8` to `SCALLAPI_URL`. Sign in with the server's `management.secret-key`.

```sh
bun run build   # dist/index.html
bun run lint
bun run typecheck
```

[docs/parity.md](docs/parity.md) lists every feature of the previous panel and every config key, with what is done.
