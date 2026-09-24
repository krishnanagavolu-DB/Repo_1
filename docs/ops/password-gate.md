# Dashboard password gate

The leadership and preview pages show a lock screen before KPIs load. The
password is **not** stored in the repository. Published `site/**/data/*.json`
files are AES-GCM envelopes; the same password opens the gate and the numbers.

## Where the password lives

| Page | Config file |
| --- | --- |
| Leadership `/` | `site/auth-config.json` |
| Preview `/preview/` | `site/preview/auth-config.json` |

Only a **SHA-256 hash** is stored (not the readable password). That hash cannot
be reversed — if the key is forgotten, set a new one.

## Change the password (also re-encrypts the published JSON)

From the repo root (updates **both** leadership and preview, then encrypts
`data/processed/` into `site/**/data/`):

```bash
python3 scripts/set_dashboard_password.py 'YourNewPasswordHere'
```

Then commit `auth-config.json` **and** the `site/**/data/*.json` envelopes and
push. Weekly ingest writes plaintext to `data/processed/`; encrypt again with:

```bash
DASHBOARD_PASSWORD='YourNewPasswordHere' python3 scripts/encrypt_site_data.py
```

`python3 scripts/encrypt_site_data.py --check` confirms the published envelopes
match processed hashes **without** needing the password.

## How it behaves

- Popup asks for the key with a rotating fun phrase
- Page behind is blurred; placeholder cards show layout only (no real numbers until unlock)
- Button label: **Unlock the metrics**
- Correct key decrypts the JSON in the browser and unlocks for that tab session
- Closing the tab clears access; reopen requires the key again

## Note

This is a **front-door lock plus encrypted payloads** for a public Pages URL. It
stops casual viewing and stops a leaked URL from serving readable weekly
numbers. It is not server-side auth. Keep the password with the people who
should see the dashboard.
