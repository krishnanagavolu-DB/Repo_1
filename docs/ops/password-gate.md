# Dashboard password gate

The leadership and preview pages show a lock screen before KPIs load. The password is **not** hard-coded in JavaScript.

## Where the password lives

| Page | Config file |
| --- | --- |
| Leadership `/` | `site/auth-config.json` |
| Preview `/preview/` | `site/preview/auth-config.json` |

Only a **SHA-256 hash** is stored (not the readable password).

## Change the password

From the repo root (updates **both** leadership and preview by default):

```bash
python3 scripts/set_dashboard_password.py 'YourNewPasswordHere'
```

Then commit and push the `auth-config.json` files.

## How it behaves

- Popup asks for the key with a rotating fun phrase
- Page behind is blurred; placeholder cards show layout only (no real numbers until unlock)
- Button label: **Unlock the metrics**
- Correct key unlocks for that browser tab session (`sessionStorage`)
- Closing the tab clears access; reopen requires the key again

## Note

This is a **front-door lock** for the hosted page. It stops casual viewing. It is not the same as private hosting or server-side auth. Keep the share link limited to people who should have the key.
