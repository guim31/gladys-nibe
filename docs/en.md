# NIBE myUplink

Brings your **NIBE heat pumps** into Gladys through **myUplink**, NIBE's cloud: temperatures (outdoor,
supply and return lines, hot water, indoor), compressor, operating mode, heating curve offset, hot water
mode and boost, produced heat and active alarms. Heat pumps of the group sold under other brands on the
same platform (CTC, Contura…) show up too, with what their points allow.

> **Developed without the hardware: feedback welcome.** The integration was written and tested against
> real myUplink answers published by other projects, not against a heat pump. If something is missing or
> wrong with yours, open an issue on GitHub.
>
> This integration is not affiliated with NIBE or myUplink.

## Requirements

- A heat pump connected to **myUplink** (you see it in the myUplink app).
- The **myUplink account** that owns it (e-mail and password of the app).
- Gladys **5.1** or later.
- To **change** a setting from Gladys (heating offset, hot water mode, boost): the paid myUplink
  **Premium Manage** subscription for that heat pump, bought in the myUplink app. Reading works without
  it.

## Configuration

Gladys talks to myUplink with an "application" that you create, free, on the myUplink developer site.

1. Open [dev.myuplink.com](https://dev.myuplink.com) and sign in **with the account of your heat pump**
   (the same as in the myUplink app). Accept the terms of use of the API if asked.
2. Open **Applications**, then **Create new application**.
3. Fill in the form:
   - **Name**: `Gladys` (anything you like);
   - **Description**: `Gladys Assistant`;
   - **Callback URL**: the form requires one but this integration never uses it; enter an https address
     such as `https://localhost/`.
4. Save. The application page shows an **Identifier** (the client ID) and a **Secret**.
5. In Gladys, open **Integrations → NIBE myUplink → Configuration** and paste the **Identifier** in
   **Client ID** and the **Secret** in **Client secret**. Choose the language of the names, keep 5 minutes
   as the refresh interval, save.
6. Click **Test the connection**: Gladys says how many heat pumps it found and whether the Premium Manage
   subscription is active.
7. Open the **Discover** tab and add your heat pump.

The client ID and secret stay in the Gladys configuration. The access token myUplink gives in exchange is
kept in the `/data` volume of the integration and renewed about every hour; neither is ever written to the
logs.

## Devices

One device per heat pump, named after the product and the myUplink system, e.g. "F730 CU 3x400V (Home)".
The integration looks for the following values among the hundreds of points myUplink publishes, and only
creates a feature when the heat pump has it:

| Feature                          | Type in Gladys         | Notes                                                      |
| -------------------------------- | ---------------------- | ---------------------------------------------------------- |
| Outdoor temperature              | Temperature            | BT1 sensor                                                 |
| Supply line temperature          | Temperature            | BT2, or the external supply line on a SMO                  |
| Return line temperature          | Temperature            | BT3, or the external return line                           |
| Hot water temperature (top)      | Temperature            | BT7                                                        |
| Hot water temperature (charging) | Temperature            | BT6                                                        |
| Indoor temperature               | Temperature            | BT50 room sensor, when installed                           |
| Compressor frequency             | Text, e.g. "57 Hz"     | Gladys has no hertz unit                                   |
| Compressor                       | Text                   | Off, starting, running, stopping                           |
| Operating mode                   | Text                   | What the heat pump works for: heating, hot water, cooling… |
| Heating curve offset             | Selection −10 … +10    | Command, when myUplink allows writing it                   |
| Hot water mode                   | Selection              | Economy, normal, luxury, smart control (model dependent)   |
| Hot water boost                  | On/off, or a selection | "Temporary lux"; a selection of durations on some models   |
| Heat produced, heating (kWh)     | Counter                | Heat meter, when the heat pump has one                     |
| Heat produced, hot water (kWh)   | Counter                | Heat meter, when the heat pump has one                     |
| Active alarms                    | Counter                | Number of alarms active on myUplink                        |
| Alarm                            | Text                   | Number and title of the latest alarm, or "No alarm"        |

A setting is only offered as a command when myUplink marks it as **writable** on your heat pump; otherwise
it stays read-only. The heating curve offset is deliberately a selection and not a thermostat: it is not a
temperature, and a voice assistant asked for "21 degrees" must never reach it.

The heat produced is shown as a counter, not as an energy meter: Gladys would count an energy index as
electricity drawn from your main meter, while this is heat delivered to the house.

The device card shows a **cloud** badge, or **unreachable** when the heat pump is no longer connected to
myUplink (its last values then stay as they were).

## Widget

The **Heat pump** widget sums one heat pump up on the dashboard: live tiles for the outdoor, supply line,
hot water and indoor temperatures, a status list (myUplink connection, operating mode, compressor, curve
offset, hot water mode, boost, alarms) and, when the heat pump accepts commands, buttons to start or cancel
the hot water boost and to move the curve offset by one step. Choose the heat pump in the widget settings.

## Scene trigger and actions

- **Heat pump alarm** (trigger): fires when a heat pump raises a **new** alarm on myUplink, once per alarm.
  You can restrict it to one heat pump. Variables: alarm number, title, description and severity, in the
  language of the integration. The alarms already active when you install the integration, or announced
  before a restart, are not fired again.
- **Actions**: the commands are device features, so a scene changes them with the standard **Control a
  device** action (boost on, offset to −2, hot water mode…). No extra action is needed.
- The **Test the connection** button of the Configuration tab checks the client ID and secret, counts the
  heat pumps and reads the Premium Manage subscription.

## Scene examples

- **Be warned of a fault**: trigger "Heat pump alarm" → action "Send a message":
  `Heat pump alarm {{triggerEvent.data.alarm_number}}: {{triggerEvent.data.header}}`.
- **Hot water when electricity is cheap**: at 1:30 a.m. on off-peak days → control a device "Hot water
  boost" = on.
- **Away for the weekend**: when the house is empty → "Heating curve offset" = −2; when someone comes back
  → 0.
- **Frost watch**: when "Outdoor temperature" goes below −15 °C → send a message.

## Troubleshooting

- **"myUplink refused the client ID or secret"**: copy them again from dev.myuplink.com, without spaces;
  check the application still exists.
- **"No heat pump on this myUplink account"**: the application was created with another account than the
  one of the heat pump. Create it again, signed in with the account used in the myUplink app.
- **"Changing a setting requires the Premium Manage subscription"**: reading works, writing needs the paid
  subscription for this heat pump. Once subscribed, try again: the integration checks it again.
- **"myUplink quota reached"**: another program uses the same application (Home Assistant, a script…). Give
  each one its own application, or raise the refresh interval.
- **Values that do not move**: the heat pump itself sends its data to myUplink every few minutes; check it
  is "connected" in the myUplink app.
- **A feature is missing**: your model names its points differently. Restart the integration with
  `LOG_LEVEL=debug`: the logs list the roles found. Open an issue with the model and that line.

## Limits

- **Cloud only**: no local access; without Internet, nothing is read nor written.
- **Quota and terms**: myUplink limits the number of requests (25 per minute and per application at the
  time of writing) and its API is offered for personal use under the terms of dev.myuplink.com. Each
  refresh costs 1 request plus 1 per heat pump added to Gladys (plus 1 when an alarm is active); the
  integration respects the quota headers and waits when told to. Every 5 minutes is the default, 1 minute
  the minimum.
- **Delay**: a change made in Gladys reaches the heat pump within a minute or two; the next reading
  confirms it.
- **Writing** requires the Premium Manage subscription.
- **Points**: only the values listed above, found by their NIBE register number, by myUplink's smart home
  category or by their English name. The ids of the F-series and of the indoor modules (VVM, SMO) are
  known; on the S-series and the other brands, the names are relied upon, which could not be checked on
  real hardware.
- The **electricity consumed** by the heat pump is not read: no myUplink point for it could be identified
  with certainty.
