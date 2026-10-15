# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular:

- **Secrets**: the myUplink client ID and secret live in the Gladys
  configuration (the secret as a `secret` field). They are sent only to
  `https://api.myuplink.com/oauth/token`, never written to the logs nor to
  `/data`.
- **`/data`**: `token.json` (the current myUplink access token, valid about an
  hour, file readable by the owner only, keyed by a SHA-256 fingerprint of the
  credentials, not the credentials themselves), `profiles.json` (which data
  point plays which role on each heat pump) and `alarms.json` (the ids of the
  alarms already announced).
- **Network**: outgoing HTTPS to `api.myuplink.com` only; the container opens
  no port and needs no access to the local network.
- **Commands**: the integration writes only the heating curve offset, the hot
  water mode and the hot water boost, and only the values myUplink declares
  for them. It never resets an alarm.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
myUplink and the heat pumps, which belong to NIBE.
