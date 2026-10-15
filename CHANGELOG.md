# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- NIBE heat pumps from the myUplink cloud, one device per heat pump: outdoor,
  supply line, return line, hot water (top and charging) and indoor
  temperatures, compressor frequency and state, operating mode, produced heat
  (heating and hot water) and active alarms.
- Commands, when myUplink marks the point writable and the Premium Manage
  subscription is active: heating curve offset (−10 to +10), hot water mode,
  hot water boost. Without the subscription, a clear message says so.
- Connection with the client ID and secret of a free application created on
  dev.myuplink.com (OAuth2 client credentials); the token is kept in `/data`.
- Refresh every 5 minutes by default (1 to 60), by the integration's own timer,
  within the myUplink quota.
- "Heat pump alarm" scene trigger, fired once per new alarm, with its number,
  title, description and severity.
- "Heat pump" dashboard widget: temperatures, state, boost and offset buttons.
- "Test the connection" button in the Configuration tab.
- Names, messages, widget and documentation in English, French, German and
  Spanish.
