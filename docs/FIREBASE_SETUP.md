# Firebase setup

Everything in this branch is dormant until a Firebase project is wired in. With
no config present the app behaves exactly as it does today — offline, local, no
login screen. That is deliberate: the branch can sit on the shelf without
changing anything for the field.

Setting it up is roughly fifteen minutes, and only steps 1 and 5 need a human.

---

## 1. Create the project (Firebase console)

1. <https://console.firebase.google.com> → **Add project**.
2. **Build → Authentication → Get started → Email/Password → Enable.**
   Leave "Email link (passwordless)" off.
3. **Build → Firestore Database → Create database** → production mode → pick a
   region close to the crews (`europe-west1` is a reasonable default).
4. **Build → Storage → Get started** → production mode, same region.
5. **Project settings → General → Your apps → Web (`</>`)** → register the app →
   copy the `firebaseConfig` values.

The free **Spark** plan is enough for everything described here.

## 2. Point the app at it

```bash
cp .env.example .env.local
```

Fill in the six `VITE_FIREBASE_*` values from step 1.5. `.env.local` is
gitignored — these values are not secrets (every web app ships them to the
browser), but there is no reason to publish which project is in use.

## 3. Publish the rules

The rules are what actually enforce admin/member. Without them the database is
open, so do this **before** putting any real data in.

```bash
npm i -D firebase-tools
npx firebase login
npx firebase use --add          # pick the project you just made
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

`firestore.indexes.json` carries the composite index the office inbox needs
(`status` + `submittedAt` on the `sketches` collection group). Deploying it up
front avoids the "this query requires an index" error on first use.

## 4. Create the admin

An admin cannot be created from the browser — the rules refuse any client write
that sets `role: 'admin'`, which is precisely what stops a field worker
promoting themselves. The first admin is seeded with the Admin SDK.

1. **Project settings → Service accounts → Generate new private key.** Save it
   as `serviceAccountKey.json` in the repo root (gitignored).
2. Run:

```bash
npm i -D firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
ADMIN_EMAIL='admin@geopoint.me' \
ADMIN_PASSWORD='<the password you were given>' \
node scripts/seed-admin.mjs
```

The script is idempotent — run it again to reset the admin password or to
repair a missing profile document. **Delete `serviceAccountKey.json` once
you're done**; it is a full-access credential.

## 5. Check it

```bash
npm run dev
```

Sign in as the admin. You should get a **ניהול / Administration** button in the
header, with **Users** and **Received sketches** tabs.

---

## How it works

### Roles

`users/{uid}` holds `{ email, displayName, role, disabled }`. Rules re-read that
document server-side on every request, so a tampered client gains nothing:
writing your own `role` is refused, and reading another user's data requires an
admin document only an admin could have created.

### Who can do what

| | Member (field worker) | Admin (office) |
|---|---|---|
| Own sketches | read / write | read |
| Other members' sketches | ✗ | read |
| Attachments on own sketches | upload / delete | read |
| Create field workers | ✗ | ✓ |
| Block / unblock a worker | ✗ | ✓ |
| Send a password reset | ✗ | ✓ |

### Where a sketch lives

`users/{uid}/sketches/{sketchId}` — always under the member who captured it.
**Sending to the office does not move or copy it.** It flips `status` to
`submitted` and stamps `submittedAt`; the admin reads it where it lies. That is
what "the sketch stays in the member's account" means in practice.

Attachments follow the same shape: bytes at
`users/{uid}/sketches/{sketchId}/…` in Storage, with a metadata document beside
the sketch so the office can list files without touching Storage.

### Offline

Auth persists to the device and Firestore runs with a persistent cache, so a
worker who signs in once keeps working in a basement with no signal. Writes
queue locally and flush when the connection returns. **The local sketch library
remains the source of truth while working — the cloud is a mirror.** Signing out
deliberately does *not* clear local sketches; on a device that is the only copy
of unsent work, wiping it would cost a surveyor their day.

---

## Known limits on the free plan

The client SDK cannot set another user's password, change their email, or delete
their auth record — those need the Admin SDK, which means Cloud Functions, which
means the **Blaze** (pay-as-you-go) plan.

What the admin panel does instead, on Spark:

- **Set a password** → only at creation time. Afterwards, *Reset password* emails
  the worker a link and they choose their own.
- **Block a worker** → `disabled: true`. Sign-in is refused and every
  rule-guarded read and write is rejected immediately. An already-open session
  keeps its token until it expires (up to an hour) but can do nothing with it.
- **Remove a worker** → deletes the profile document, which blocks all access.
  The auth record itself survives; delete it from the console, or add the
  optional Cloud Functions.

If Blaze is available, see `functions/README.md` for the callable functions that
close these gaps.
