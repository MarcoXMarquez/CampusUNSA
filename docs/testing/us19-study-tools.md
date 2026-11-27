# Study tools and Telegram task queries

## Focus timer

Open **Horario** and expand **Temporizador Pomodoro**. Choose 5 to 120 minutes,
start the timer, and use the pause, resume, and reset controls as needed. The
browser stores the session and derives the remaining time from an absolute
deadline. The timer runs when another app tab is selected. A page restored after
suspension calculates the current time from that deadline.

A start gesture enables the chime where Web Audio is available. The
notification control requests the browser permission explicitly. On completion,
the app uses the active service worker for the notification where possible.
Browser and operating-system policies govern background delivery when the app is
suspended or closed.

## Academic calendar

Open **Horario**, expand **Suscribir mi horario**, and select the last day of
classes. Use the resulting HTTPS URL as a read-only subscription in
[Google Calendar](https://support.google.com/calendar/answer/37100) or
[Apple Calendar](https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/ios).

The feed reflects the active academic term, combines the weekly schedule with
America/Lima time, and ends on the date requested by the student. The date must
be within 180 days. The feed preserves event identifiers across refreshes and
follows RFC 5545 escaping and line folding.

Apply the Alembic migration before starting the backend. Issue links only from
an authenticated session. The database stores a SHA-256 digest of the random
link credential. Generating another link rotates the credential, and revocation
makes that link unavailable on future requests. Treat the URL as private.
Current app access logs redact it. Configure any reverse proxy or external
logging service to redact the calendar path as well. Calendar clients control
refresh frequency and may retain events already imported.

## Telegram

Set the backend variables `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET`
in the deployment environment. Register the HTTPS route
`/api/v1/webhooks/telegram` using Telegram's
[setWebhook method](https://core.telegram.org/bots/api#setwebhook) with that
secret and `allowed_updates` set to `["message"]`. The provider sends the
secret in `X-Telegram-Bot-Api-Secret-Token`. Keep the bot token in the
deployment operator's credential store.

Link Telegram from CampusUNSA or use the app pairing link to send the existing
five-minute OTP as `/start CODE`. In the private bot chat, `/tareas` or
`/tasks` shows up to ten incomplete assignments for the linked active student
with deadlines in Lima time. Telegram sends the reply from the authenticated
webhook response. Telegram's reply delivery is verified by observing the bot
chat after deployment.

## Verification

```bash
docker compose exec -T backend python -m pytest tests/test_calendar_feed.py tests/test_telegram_queries.py tests/test_study_tools_api.py -q
npm --prefix frontend run test -- src/lib/focus-timer.test.ts
```
