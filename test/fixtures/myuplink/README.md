# myUplink fixtures

Real answers of the myUplink API, taken from the tests of the Home Assistant
`myuplink` integration
([home-assistant/core](https://github.com/home-assistant/core/tree/dev/tests/components/myuplink/fixtures),
Apache-2.0):

| File                   | Origin                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| `points-f730.json`     | `device_points_nibe_f730.json` (NIBE F730), unchanged             |
| `points-smo20.json`    | `device_points_nibe_smo20.json` (NIBE SMO 20), duplicates removed |
| `points-ctc-i555.json` | `device_points_ctc_i555.json` (CTC i555), unchanged               |
| `systems.json`         | `systems.json`, unchanged                                         |
| `systems-multi.json`   | `systems-multi.json`, unchanged                                   |

Two files are **synthetic**, written for this repository to exercise cases the
published dumps do not cover. They follow the shape of the real points but
their values are invented:

- `points-heat-meters.json`: an indoor module with the NIBE heat meter
  registers (44298, 44300, 44306, 44308), a missing room sensor (-32768) and
  a "temporary lux" boost with durations, as on a SMO 20;
- `points-s-series-names.json`: a heat pump whose parameter ids are unknown to
  the integration, so that only the English point names identify the roles.
