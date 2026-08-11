# Dashboard password gate (preview)

The preview page can show a lock screen before KPIs load. The password is **not** hard-coded in JavaScript.

## Where the password lives

File: `site/preview/auth-config.json`

Only a **SHA-256 hash** is stored (not the readable password).

## Change the password

From the repo root:

```bash
python3 scripts/set_dashboard_password.py 'YourNewPasswordHere'
```

Then commit and push `site/preview/auth-config.json` (and promote later if leadership should use the same gate).

Starting password used for first setup: ask the dashboard owner (do not put plaintext passwords in docs/commits if you can avoid it).

## How it behaves

- Popup asks for the key with a rotating fun phrase
- Page behind is blurred; placeholder cards show layout only (no real numbers until unlock)
- Correct key unlocks for that browser tab session (`sessionStorage`)
- Closing the tab clears access; reopen requires the key again

## Note

This is a **front-door lock** for the hosted page. It stops casual viewing. It is not the same as private hosting or server-side auth. Keep the share link limited to people who should have the key.
