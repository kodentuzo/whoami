# whoami

A small app that checks a [Spotcraft](https://kodentuzo.com/spotcraft) instance end to end. Deploy
it, open its page, and see what Spotcraft gives an app: HTTPS, the environment, the database and
its migration, the mail relay, the user pool, the legal facts and analytics. It works like
[traefik/whoami](https://github.com/traefik/whoami), for a whole platform rather than one proxy.

It's public domain ([the Unlicense](LICENSE)), so you can also copy it as the start of your own app.
The parts it uses keep their own licenses ([NOTICE](NOTICE)).

## Deploy it

1. In your Spotcraft dashboard, add an app:
   - **Name:** `whoami`;
   - **Image:** `vindotski/whoami`, tag `0.2.0`;
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

Development and releases: [CONTRIBUTING.md](CONTRIBUTING.md).
