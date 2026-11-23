# whoami

Check that a [Spotcraft](https://kodentuzo.com/spotcraft) instance serves apps.

**State: live.** Version 0.2.0, image `kodentuzo/whoami`. It checks Spotcraft 0.19 as it is
today. The changes the slots bring are planned; see [Today and planned](#today-and-planned).

Deploy it, open its page, and see what the instance gives an app: HTTPS, the environment, the
database and its migration, mail, accounts, the legal facts and analytics. It works like
[traefik/whoami](https://github.com/traefik/whoami), for a whole platform rather than one proxy.
It has no website page; this repo is its only home.

It's public domain ([the Unlicense](LICENSE)), so you can also copy it as the start of your own app.
The parts it uses keep their own licenses ([NOTICE](NOTICE)).

## Deploy it

1. In your Spotcraft dashboard, add an app:
   - **Name:** `whoami`;
   - **Image:** `kodentuzo/whoami`, tag `0.2.0` (today from Docker Hub; once the instance pulls
     only from its Spotdeck, push the image there first, see
     [Today and planned](#today-and-planned));
   - **Environment:** `WHOAMI_MAIL_TO=<your address>`, if you want to send a test email.
2. Open `https://whoami.<your apps domain>`.
3. Press **Send a test email**. Look at its headers in your inbox (Gmail and Outlook: "Show
   original"): SPF, DKIM and DMARC should pass.
4. On the app's **Backups** page, press **Back up now**, then look for
   `whoami/<time>/database.dump` in your bucket.
5. Remove the app when you're done, or keep it as a canary.

The same report comes as JSON: `curl -H 'Accept: application/json' https://whoami.<domain>/`.

## What each check means

| Check       | Green means                                                                                                                                                                                             | If not                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| HTTPS       | Caddy reached the app over HTTPS (`X-Forwarded-Proto: https`).                                                                                                                                          | Plain HTTP means nothing is in front of the app, as when you run it locally.                                     |
| Environment | Every variable Spotcraft always sets is there. Secrets show only as "set".                                                                                                                              | A missing one points at the instance's version or setup.                                                         |
| Database    | The app's role reached its own schema, the migration created `visits`, and this visit was counted.                                                                                                      | "Migration didn't run": the image's `dev.spotcraft.migrate` label wasn't run. Otherwise the error from Postgres. |
| Mail        | The instance has a mail provider, and `WHOAMI_MAIL_TO` is set.                                                                                                                                          | Off: the instance has no `MAIL_SMTP_URL`. Amber: set `WHOAMI_MAIL_TO`.                                           |
| Accounts    | The user pool's public keys are reachable.                                                                                                                                                              | Off: the instance has no pool.                                                                                   |
| Legal facts | `LEGAL_FACTS` parses and names a controller.                                                                                                                                                            | Amber: fill in your details on the dashboard's Settings page.                                                    |
| Analytics   | The browser loaded the tracker (`/_spotcraft/s.js`, Spotless on Spotcraft 0.15+), so this visit counts, plus one test event, `whoami-check`. It follows the instance's mode: opt-out, opt-in or server. | Off: analytics are off for this app.                                                                             |

Each page view adds a row to `visits`, so the count is something to back up and restore: after a
restore, it goes back to what it was.

**Mail can't be misused.** The button sends only to `WHOAMI_MAIL_TO`, which only you can set, at
most once a minute, and only from the app's own page.

## Run it locally

```bash
pnpm install
DATABASE_URL=postgres://… pnpm migrate
DATABASE_URL=postgres://… SMTP_URL=smtp://localhost:1025 MAIL_FROM=noreply@example.com WHOAMI_MAIL_TO=you@example.com pnpm start
```

## Today and planned

whoami checks what an instance does **today**. Some of that changes with the slots (planned for
Spotcraft 0.20). The code is not changed yet; it follows when Spotcraft does.

- **Every slot is always on (planned).** An instance runs all eight slots: accounts, analytics,
  mail, legal, registry, backups, monitoring and sync (sync after the MVP). A mail provider and a
  backup bucket become required setup steps, and setup fails without them. Today a
  check can show "Off" when the instance has no user pool, no mail provider or analytics turned
  off. Once every slot is required, "Off" for Mail, Accounts or Analytics means a broken
  instance, not a choice.
- **Analytics has one mode and no switch (planned, Spotless 0.2).** Visits are counted, never
  people: no cookies, nothing stored on the device, no consent banner. Every app on an instance
  is counted the same way, and the per-app `analytics: false` switch goes. Today the check still
  follows the instance's mode (opt-out, opt-in or server) and the app's switch. The opt-in,
  server and "off for this app" branches go away. The check reads `/_spotcraft/config.json`,
  which then lists every slot with its path; whoami follows the field names in Spotcraft's
  contract. whoami's Content-Security-Policy already allows the counting script, since it is
  served from the app's own origin.
- **One registry per instance (planned).** Spotdeck ships in every instance, and Spotcraft pulls
  only from it. Then an app is a name and a tag on the instance's own Spotdeck, so the image has
  to be in the instance's Spotdeck first. There is one way to get a public image there: the
  owner pulls `kodentuzo/whoami` from Docker Hub and pushes it from their own machine, with
  the push token of the `whoami` repository (decided 2026-11-23). Today the instance pulls it
  from Docker Hub, so deploying needs no push.
  Spotdeck keeps the last 10 tags of each app and never deletes the live one, so whoami kept as
  a canary stays deployable.
- **Backups move to Spotvault (planned).** Copies are encrypted before they leave the server, so
  the object in the bucket is no longer a readable `database.dump`. After a restore, Spotcraft
  redeploys the app, so its migration runs, and the visit count goes back to what it was.
- **No `LEGAL_FACTS` variable (planned, Spotcraft 0.21).** An app reads the legal facts at
  `/_spotcraft/legal.json`, through Spotkit. The variable goes in 0.21 with the other old ways,
  so the Legal facts check then reads that file instead. Today it reads `LEGAL_FACTS`.
- **No Cloudflare.** whoami never talks to Cloudflare. It checks the HTTPS that Caddy gives
  the app.
- **No `spotkit.json` needed.** whoami runs its migration through the image's
  `dev.spotcraft.migrate` label, which the server reads. `spotkit.json` (which replaces
  `spotcraft.json`) is read only by Spotkit's CLI for local work, and whoami doesn't use it.

whoami already meets the privacy baseline: it stores no IP address, sets no cookie and keeps
nothing on the device. Its `visits` table holds only an id and a time.

## Development

Development and releases: [CONTRIBUTING.md](CONTRIBUTING.md).
