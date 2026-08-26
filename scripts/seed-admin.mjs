#!/usr/bin/env node
/**
 * Create (or repair) the one admin account.
 *
 * An admin cannot be made from the browser: the security rules refuse any
 * client write that sets role === 'admin', which is exactly what stops a member
 * promoting themselves. So the first admin is seeded here with the Admin SDK,
 * and every later admin is created by an existing one.
 *
 * The script is idempotent — run it again to reset the password or to repair a
 * profile document that went missing.
 *
 * Credentials are read from the environment and are never written to the repo:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *   ADMIN_EMAIL=admin@geopoint.me \
 *   ADMIN_PASSWORD='...' \
 *   node scripts/seed-admin.mjs
 *
 * Requires firebase-admin, which is intentionally not a dependency of the web
 * app: install it just for this task with `npm i -D firebase-admin`.
 */

import { readFileSync } from 'node:fs';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_NAME || 'Administrator';
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!email || !password) fail('Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.');
if (password.length < 8) fail('Choose an admin password of at least 8 characters.');
if (!keyPath) fail('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file.');

let admin;
try {
  admin = await import('firebase-admin');
} catch (_) {
  fail('firebase-admin is not installed. Run: npm i -D firebase-admin');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (err) {
  fail(`Could not read the service account file at ${keyPath}: ${err.message}`);
}

const app = admin.default.initializeApp({
  credential: admin.default.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const auth = admin.default.auth(app);
const db = admin.default.firestore(app);

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password, displayName, disabled: false });
  console.log(`  Updated the existing account for ${email}`);
} catch (err) {
  if (err.code !== 'auth/user-not-found') fail(`Auth lookup failed: ${err.message}`);
  user = await auth.createUser({ email, password, displayName, emailVerified: true });
  console.log(`  Created ${email}`);
}

// Storage rules cannot read Firestore, so admin status also rides on the token.
await auth.setCustomUserClaims(user.uid, { admin: true });

await db.collection('users').doc(user.uid).set(
  {
    uid: user.uid,
    email,
    displayName,
    role: 'admin',
    disabled: false,
    createdAt: admin.default.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

console.log(`  Role 'admin' set for uid ${user.uid}`);
console.log('\n  Done. Sign in with that email and password, then change it from the app.\n');
process.exit(0);
