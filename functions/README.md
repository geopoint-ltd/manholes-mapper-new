# Optional admin callables (Blaze plan)

The app is fully usable without these. They exist only to close what the client
SDK cannot do on any plan:

| Callable | What it adds |
|---|---|
| `adminSetPassword` | Set a member's password directly, instead of emailing a reset link |
| `adminUpdateEmail` | Change a member's sign-in email |
| `adminDeleteUser` | Delete the auth record, not just the profile document |

Deploying Cloud Functions requires the **Blaze** (pay-as-you-go) plan. Blaze has
a free monthly allowance that a handful of admin calls will not exceed, but it
does require a billing account on the project.

```bash
cd functions && npm install
cd .. && npx firebase deploy --only functions
```

Each function re-reads the caller's role from Firestore server-side. A role
claimed by the client is never trusted.
