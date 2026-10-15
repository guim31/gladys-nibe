# NIBE myUplink for Gladys Assistant

Brings **NIBE heat pumps** (F-series, S-series, VVM and SMO indoor modules) into
[Gladys Assistant](https://gladysassistant.com) through **myUplink**, NIBE's
cloud and its official API. Heat pumps of the group sold under other brands on
the same platform (CTC, Contura…) show up too, with what their data points
allow.

> **Developed without the hardware: feedback welcome.** It was written and tested
> against real myUplink answers published by other projects (see Credits), not
> against a heat pump. Open an issue if something is missing or wrong with yours.

## Features

- **One device per heat pump**, with the useful values among the hundreds of
  myUplink data points: outdoor, supply line, return line, hot water (top and
  charging) and indoor temperatures, compressor frequency and state, operating
  mode (heating, hot water, cooling…), produced heat (heating and hot water,
  kWh, on heat pumps with a heat meter), active alarms and the latest one.
- **Commands**, only for the points myUplink marks **writable**: heating curve
  offset (−10 … +10, a selection, deliberately not a thermostat), hot water
  mode, hot water boost. Writing needs the paid myUplink **Premium Manage**
  subscription: without it, Gladys says so clearly.
- **"Heat pump alarm" scene trigger**: once per new alarm, with its number,
  title, description and severity.
- **"Heat pump" dashboard widget**: live temperatures, a status list, boost and
  offset buttons.
- **"Test the connection"** button: credentials, heat pumps found, subscription.
- Every text in **English, French, German and Spanish** (`language` setting,
  French by default).

## Requirements

- A heat pump connected to myUplink, and the myUplink account that owns it.
- A free application created on [dev.myuplink.com](https://dev.myuplink.com)
  with that account: its client ID and secret.
- Gladys 5.1.0 or later.
- For the commands: the myUplink Premium Manage subscription.

## Installation

In Gladys: **Integrations → Install from GitHub**, enter
`https://github.com/guim31/gladys-nibe`, then fill in the client ID and secret
in the Configuration tab and add the heat pump from the Discover tab. The
step-by-step guide, with the creation of the myUplink application, is in the
documentation: [English](docs/en.md), [Français](docs/fr.md),
[Deutsch](docs/de.md), [Español](docs/es.md).

## How it works

- **Authentication**: OAuth2 _client credentials_ with the application's client
  ID and secret (scopes `READSYSTEM WRITESYSTEM`, falling back to `READSYSTEM`).
  No browser round trip, no callback to reach Gladys. The token (about one hour)
  is kept in `/data/token.json` and renewed before it expires.
- **Discovery**: `GET /v2/systems/me`, then the full point list of each heat
  pump, read in English. Each role (outdoor temperature, offset…) is matched by
  its NIBE register number, else by myUplink's smart home category, else by its
  English name; `-32768` (no sensor) never plays a role. The roles found are
  kept in `/data/profiles.json`, so a sensor briefly missing never removes a
  feature.
- **Refresh**: the integration's own timer, every 5 minutes by default (1 to
  60). One cycle is `GET /v2/systems/me` plus one filtered point request per
  heat pump added to Gladys, plus the active alarms only when myUplink flags
  one. The quota headers (`RateLimit-*`, 25 requests per minute at the time of
  writing) and the 429 answers are honored: the client waits instead of
  insisting. The core's `onPoll` is only a fallback (Gladys#3198). Only changes
  are published, with a 6-hour heartbeat.
- **Writes**: `PATCH /v2/devices/{id}/points`, only with a value the point
  declares; refused before any request without the write scope or the Premium
  Manage subscription (`GET /v2/systems/{id}/subscriptions`), and on a 403.

## Limitations

- Cloud only: without Internet, nothing is read nor written.
- The data is as fresh as myUplink's: the heat pump uploads it every few
  minutes, and a command reaches it within a minute or two.
- The register numbers of the F-series and of the VVM/SMO indoor modules are
  known; on the S-series and other brands, the roles rely on the point names,
  not checked on real hardware.
- The electricity consumed by the heat pump is not read (no myUplink point
  identified with certainty), and the produced heat is a plain counter, not an
  energy meter (Gladys would count it as electricity).
- Not every setting is exposed: only the three commands above, on purpose.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test: fake Gladys (SDK) + fake myUplink cloud
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
node scripts/probe.mjs                            # real API, fake credentials, read only
```

```
index.js                SDK wiring (src/app.js registers the handlers)
src/app.js              handlers: discovery, commands, action, widget, lifecycle
src/hub.js              discovery, refresh cycle, alarms, commands, statuses
src/poller.js           the container's own refresh timer, onPoll as fallback
src/devices.js          heat pump -> Gladys device, features and states
src/widgets.js          "Heat pump" dashboard widget
src/myuplink/client.js  myUplink API client: OAuth, quota, errors
src/myuplink/points.js  which data point plays which role
src/i18n.js             every text, in four languages
src/store.js            JSON files under /data
scripts/probe.mjs       read-only probe of the real API
test/                   node --test; fixtures/myuplink: real API answers
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

`scripts/probe.mjs` runs the integration's client against the real API. Without
credentials it walks the OAuth flow until myUplink refuses the fake ones; with
`MYUPLINK_CLIENT_ID` and `MYUPLINK_CLIENT_SECRET` it lists the heat pumps, the
roles found and the quota, and never writes. It prints no secret.

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. A hand-pushed `vX.Y.Z` tag also builds the image and the
GitHub Release, but then `version` in `package.json` and in the manifest (with
the `docker_image` tag) must be bumped and committed before tagging. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Home Assistant's
  [`myuplink`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/myuplink)
  integration (Apache-2.0): the test fixtures in `test/fixtures/myuplink/` are
  real myUplink answers from its test suite (NIBE F730, SMO 20, CTC i555), and
  it showed the garbage point 65535 and the decimal enumeration values.
- [`myuplink`](https://github.com/pajzo/myuplink) by Peter Winkler (MIT), the
  library Home Assistant uses: the endpoints and their shapes.
- [`home-assistant-myuplink`](https://github.com/jaroschek/home-assistant-myuplink)
  by Stefan Jaroschek (MIT): the quota headers, the subscription check before a
  write, the active alarms.
- The openHAB [myUplink binding](https://www.openhab.org/addons/bindings/myuplink/)
  and [myuplink-exporter](https://github.com/webdevops/myuplink-exporter) (MIT):
  the client credentials grant for a personal application.
- [`nibe`](https://github.com/yozik04/nibe) by Jevgeni Kiski (GPL-3.0), read
  only, never copied: the meaning of the NIBE heat meter registers.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by NIBE or myUplink.
"NIBE" and "myUplink" are trademarks of their owners.

## License

Apache-2.0
