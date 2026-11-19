# Parity spec

The panel replaces CPAMC (router-for-me/Cli-Proxy-API-Management-Center) for scallapi. Every CPAMC feature listed here must exist in the panel, and every config key and v8 management endpoint must have an interface. Sponsor and referral features are not carried over. Usage analytics are on hold; they will come from cpa-usage-keeper later.

Status column: `todo`, `done`. A row is `done` only after it has been run against a real scallapi.

## Navigation

| Section | 中文 | Holds |
|---|---|---|
| Overview | 总览 | Request totals, success rate, tokens, provider breakdown, recent requests, in-flight requests, update notice |
| Credentials | 凭据 | Two tabs: **OAuth accounts** (auth files) and **API providers** (`api-keys.*` groups and keys) |
| Routes | 路由 | Endpoint routes, route resolver, per-route payload rules |
| Load balancing | 负载均衡 | Priority tiers, weights, strategy, session affinity, retry, cooldown |
| Models | 模型 | Catalog sources and status, models per credential, OAuth model aliases, excluded models, per-channel model caps |
| Quota | 额度 | Per-credential quota, resets, Claude reset grants, Codex credit overage, plugin quota |
| Clients | 客户端 | Proxy API keys (`access.api-keys`) |
| Plugins | 插件 | Installed plugins, store, per-plugin config |
| Logs | 日志 | Request logs, error logs, request detail |
| Settings | 设置 | Every remaining config key, grouped; raw YAML editor |
| System | 系统 | Version, update check, connection, diagnostics |

## Global shell

| CPAMC feature | Panel | Status |
|---|---|---|
| Login with base URL, management key, remember key | Login page; key in localStorage when remembered, sessionStorage otherwise | done |
| Auth probe `GET /config` | Same | done |
| Logout, forced logout on 401 | Sidebar user menu; 401 handler | todo |
| Legacy backend detection on 404 | Login error naming the incompatible server | todo |
| Connection status | Sidebar footer status | todo |
| Server version and build date from response headers | Sidebar footer and System | todo |
| Plugin capability header | Plugins nav shown only when supported, explicit unsupported state on deep link | todo |
| Update notice `GET /server/latest-version` | Sidebar footer badge, System page | todo |
| Theme light/dark/system | Sidebar user menu | done |
| Language zh/en | Sidebar user menu | done |
| Toasts and confirmations | shadcn toast and alert dialog | todo |
| Unsaved changes guard | Route blocker on every form with a dirty state | todo |
| Header refresh per page | Page header refresh action | todo |
| Responsive sidebar | shadcn sidebar (offcanvas on mobile) | done |

## Overview

| CPAMC feature | Panel | Status |
|---|---|---|
| KPI cards from `/observability/logs` | Overview stats | todo |
| Traffic breakdown by result and provider | Overview chart | todo |
| Provider stats rows linking to credentials | Overview table, links to filtered Credentials | todo |
| Recent requests, row opens request detail | Overview table, detail sheet | todo |
| Quick links | Dropped: the sidebar already links every section | — |
| New: in-flight requests `GET /observability/requests/in-flight` | Overview | todo |

## Credentials: OAuth accounts

| CPAMC feature | Panel | Status |
|---|---|---|
| List `GET /credentials`, background refresh every 240 s | Table, query refetch interval 240 s | todo |
| Counts total, active, problem | Tab header counts | todo |
| Provider filter, status filter, search with wildcards, sort, page size, pagination | Data table toolbar | todo |
| Upload `.json` files `POST /credentials` multipart, per-file failures | Add menu → Upload files | todo |
| Refresh all `POST /credentials/refresh {all:true}` with results dialog | Toolbar action, results dialog | todo |
| Sync model catalog `POST /models/refresh` | Models page action; also toolbar | todo |
| Delete all or filtered `DELETE /credentials` | Toolbar destructive action naming the scope | todo |
| Select and batch download, enable, disable, delete | Row selection and batch bar | todo |
| Enable/disable `PATCH /credentials/status` | Row switch | todo |
| Refresh one `POST /credentials/refresh {name}` | Row menu | todo |
| Reset cooldown `POST /routing/cooldown/reset` | Status badge action | todo |
| Download `GET /credentials/download` | Row menu | todo |
| Delete | Row menu with confirmation | todo |
| View models | Details sheet, Models tab (`GET /credentials/models`) | todo |
| Details sheet: metadata, cooldowns, quota | Details sheet | todo |
| Policy fields `PATCH /credentials/fields`: request retry, model aliases (fork, display name, force mapping), request-scoped errors, prefix, proxy URL | Details sheet, Settings tab | todo |
| Runtime-only files: no select, download or delete | Badge, actions disabled | todo |
| Problem detection | Status column | todo |
| New: priority, weight, note, headers, websockets, excluded models, Claude cloak mode, strict mode, sensitive words, cache user ID, timezone, fingerprint profile, Vertex interactions | Details sheet, Settings tab | todo |
| New: verify credential `POST /credentials/verify` | Row menu | todo |

## Credentials: OAuth sign-in

| CPAMC feature | Panel | Status |
|---|---|---|
| Provider tiles with browser or device method | Add menu → Sign in → provider list | todo |
| Browser flow: open link, copy link, poll `GET /oauth/status` | Sign-in dialog | todo |
| Device flow: user code, verification URL, polling, resume after reload | Sign-in dialog | todo |
| Manual callback `POST /oauth/callback` | Sign-in dialog, paste field | todo |
| Cancel `DELETE /oauth/session` | Dialog close | todo |
| Success summary, refresh lists | Dialog success state | todo |
| Recover a specific credential (`name`/`auth_index` on auth-url) | Row menu → Sign in again | todo |
| SIWC bind `POST /oauth/siwc/bind`, status | Codex row menu, status badge (`GET /oauth/siwc/status`) | todo |
| Vertex import `POST /oauth/import?provider=vertex` | Add menu → Import Vertex service account | todo |

## Credentials: API providers

| CPAMC feature | Panel | Status |
|---|---|---|
| Provider groups from `/config/api-keys` | Table grouped by provider family | todo |
| Add, edit, delete group (`PUT /config/api-keys/<family>`, If-Match) | Group sheet | todo |
| Enable/disable key | Key switch | todo |
| Test model and model list via `/requests/api-call` | Group sheet, Test tab | todo |
| Model mapping and aliases | Group sheet, Models tab | todo |
| Excluded models | Group sheet | todo |
| Headers, proxy, priority, websockets, cloak flags | Group sheet | todo |
| Sensitive word replacement (Antigravity, Devin) | Settings → Provider behavior | todo |
| Raw unknown fields preserved on edit | Group sheet writes merge into the existing node | todo |
| New: every group field (`name`, `base-url`, `priority`, `prefix`, `disable-cooling`, `request-retry`, `request-scoped-errors`, `headers`, `proxy-url`, `models`, `excluded-models`, `connection-pool`) | Group sheet | todo |
| New: every key field with inherit/override (`weight`, `priority`, `prefix`, `proxy-url`, `headers`, `models`, `excluded-models`, `disable-cooling`, `request-retry`, `request-scoped-errors`, `connection-pool`) | Key sheet, each field with an Inherit toggle | todo |
| New: provider-specific fields (Vertex `interactions`; Codex `disable-codex-cloaking`, `alpha-search`, `websockets`; Claude `rebuild-mid-system-message`, `native-tool-search`, `cloak.*`, `fingerprint-profile`; xAI `websockets`; OpenAI-compatible `disabled`, `support-prompt-cache-key`, model `image`, modalities, `use-max-completion-tokens`) | Group and key sheets | todo |
| New: model fields `max-context-length`, `is-compat`, `force-mapping`, `support-configuration-update`, `thinking.*` | Models tab | todo |
| New: `vertex-compat` | Provider family in the table | todo |

## Routes

| Feature | Panel | Status |
|---|---|---|
| `routes[]`: name, path, rewrite-to, providers, auth-files | Route list and editor | done |
| Route resolver (which credential serves a model on a path) | Editor, computed from credentials and `/credentials/models` | todo |
| Per-route payload rules (`payload.*[].models[].route`) | Editor, Payload tab | todo |

## Load balancing

| CPAMC feature | Panel | Status |
|---|---|---|
| Tier ladder from priorities | Tier board | todo |
| Drag between tiers, keyboard moves | Tier board | todo |
| Priority conflict warning | Inline alert | todo |
| Per-model weights | Weight dialog | todo |
| Strategy, session affinity, TTL, subagents | Settings panel on the page | todo |
| Change review before save | Review dialog | todo |
| Save with per-change progress, stop on first failure | Same, with the failed and not-attempted changes listed | todo |
| New: `routing.retry.*`, `routing.cooldown.*`, `routing.force-model-prefix` | Settings panel on the page | todo |

## Models

| CPAMC feature | Panel | Status |
|---|---|---|
| Sync catalog `POST /models/refresh` | Catalog card action | todo |
| Model list by provider, copy name (System page) | Models table | todo |
| Models per credential via `/requests/api-call` | Models table, filter by credential | todo |
| OAuth excluded models per channel (`oauth.excluded-models`) | Models → Exclusions | todo |
| OAuth model aliases per channel (`oauth.model-alias`) | Models → Aliases | todo |
| New: catalog sources `models.catalog`, `models.codex-catalog`, `models.devin-catalog` | Catalog card | todo |
| New: static definitions `GET /routing/model-definitions/<channel>` | Models table, Source column | todo |
| New: per-channel caps `oauth.settings.<channel>[]` | Models → Context caps | todo |

## Quota

| CPAMC feature | Panel | Status |
|---|---|---|
| Per-credential quota via `/requests/api-call` | Quota table | todo |
| Provider filter, search, sort, layout, pagination | Toolbar | todo |
| Refresh one, refresh all | Row and toolbar | todo |
| Reset where supported | Row menu with confirmation | todo |
| Claude reset grants | Dialog | todo |
| Codex credit overage | Row detail | todo |
| Antigravity credits, xAI, Kimi, Meta, Devin quota | Provider-specific detail | todo |
| Plugin quota `GET/POST/DELETE /plugins/<id>/quota` | Row detail | todo |
| Shared quota cache with Credentials | One query key per credential | todo |

## Clients

| CPAMC feature | Panel | Status |
|---|---|---|
| List, add, remove, reveal, copy keys, strength meter (`/config/access/api-keys`) | Clients table | todo |

## Plugins

| CPAMC feature | Panel | Status |
|---|---|---|
| Installed list, summary, search | Installed tab | todo |
| Toggle `PUT /config/plugins/configs/<id>/enabled` | Row switch | todo |
| Configure `GET/PUT /config/plugins/configs/<id>` from ConfigFields | Config sheet | todo |
| Delete `DELETE /plugins/<id>` | Row menu | todo |
| Store `GET /plugins/store` (refresh), install/update with version and auth gate | Store tab | todo |
| Restart-required banner | Page alert | todo |
| New: `plugins.dir`, `plugins.store-sources`, `plugins.store-auth[]` | Plugins → Settings | todo |

## Logs

| CPAMC feature | Panel | Status |
|---|---|---|
| Request log list, filters, search, auto-refresh | Requests tab | todo |
| Request detail `GET /observability/logs/requests/<id>`, copy, wrap | Detail sheet | todo |
| Error log files, view, download, missing-file message | Errors tab | todo |
| Clear logs `DELETE /observability/logs` | Toolbar with confirmation | todo |
| Request log recording toggle | Toolbar switch (`observability.logs.request-log`) | todo |

## Settings

Every key not owned by a page above. Each section is a form; the YAML editor covers the whole file with ETag conflict detection.

| Section | Keys | Status |
|---|---|---|
| Server | `server.host`, `port`, `max-request-body-bytes`, `trusted-proxies`, `tls.*`, `shutdown-timeout`, `commercial-mode`, `kv-store.*`, `response-compression.*`, `discovery.*` | todo |
| Management | `management.allow-remote`, `secret-key`, `disable-control-panel`, `panel-github-repository`, `server.github-token` | todo |
| Network | `requests.proxy-url`, `requests.tls-handshake-timeout-seconds`, passthrough headers | todo |
| Request rules | `payload.default`, `default-raw`, `override`, `override-raw`, `filter`, `replace` (all matchers incl. `route`) | todo |
| Client compatibility | `client.codex.*`, `client.claude.*` | todo |
| Provider behavior | `upstream.codex.*`, `upstream.claude.*` (incl. header defaults, beta strip/append, diagnostics, client request ID), `upstream.xai.*`, `oauth.providers.*` (AI Studio, Codex live media relay and header defaults and SIWC identifier, Antigravity pool, sensitive words, TOS pause, credits, signature cache, Devin sensitive words), `oauth.request-scoped-errors` | todo |
| Multimedia | `multimedia.*` | todo |
| Observability | `observability.logs.*`, `observability.usage.*`, `observability.pprof.*` | todo |
| Credentials | `oauth.auth-dir`, `oauth.auth-auto-refresh-workers`, `credentials.concurrency`, `credentials.in-flight` | todo |
| Raw YAML | `GET/PUT /config.yaml` with If-Match | todo |

Restart-only keys are labeled in the form; saving one shows that a restart is needed.

## Dropped

| CPAMC feature | Why |
|---|---|
| APIKEY.FUN, AICodeMirror, FennoAI, Qiniu, Kimi sponsor flows, Double 11 banner, affiliate links | Advertising |
| Dashboard quick-link cards | Duplicates the sidebar |
| Page transition animations, login veil, edge-swipe back | Decorative |

## Open shape questions to read from the backend while building

- `server.discovery` and `server.response-compression` leaf names.
- `payload.replace` rule struct.
- `oauth.providers.{claude,gemini,vertex,kimi,xai,meta}` fields beyond the template.
- `/observability/logs` query parameters.
- Per-provider quota endpoints used through `/requests/api-call` (from CPAMC `features/quota/providers`).
