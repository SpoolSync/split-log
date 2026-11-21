# Split Log

Split costs with friends and settle up. An installable phone web app, part of Pixora.
It works offline, and with a Pixora account it syncs: friends in a shared group see the
same totals and can add expenses themselves.

## What it does
- Groups of people, each with its own currency.
- Expenses split equally, by exact amounts, by percent, by shares (weights), or item by item
  with tax and tip spread in proportion.
- One payer or several. Receipt photo on any expense.
- Balances per person, plus the fewest payments needed to settle up. Record payments.
- Monthly repeats for rent, internet and the like.
- Invite friends to a group with a link. They join with a free Pixora account.
- Share a text summary, a view-only link (no account needed), a spreadsheet (CSV), or the
  whole group as a file.
- Passcode set once per phone, then it stays unlocked. Encrypted backup and restore.

## Privacy
- Everything is encrypted on the phone before it's uploaded. Your own list of groups is
  encrypted with your Split Log key, which is stored only wrapped by your passcode.
- Each group has its own key. It travels only inside the invite link (after the `#`, which
  browsers never send to a server), so the Pixora database holds only ciphertext.
- Receipt photos stay on the phone that took them.
- Joining a group requires the secret in the invite. The database stores only a one-way
  fingerprint of that secret. The rules are in `firestore.rules.splitlog.txt` and are
  published in the Pixora project's Firestore rules.

## Cloud
Pixora Firebase project `pixora-bca1f`, web app "Split Log". `cloud.js` holds the web config;
it is not a secret, access is controlled by the database rules.
- `apps/splitlog/users/<uid>`: your own encrypted list of groups (owner only).
- `apps/splitlog/groups/<id>`: one group, readable and writable by its members only.

The Firebase scripts are vendored (10.12.2) so the app starts offline.

## Host it (GitHub Pages)
Settings > Pages > Deploy from a branch > main, / (root). The address is
https://spoolsync.github.io/split-log/

## Install on a phone
Open the address in Safari > Share > Add to Home Screen, then open it from the icon.
An invite link opens in Safari, which keeps separate data from the home-screen app: copy
the link, open Split Log from the home screen, tap Join a group and paste it.

## Checking the maths
`node test/core.test.js`

When you change files, bump `CACHE` in `sw.js` so installed phones pick up the new copy.
