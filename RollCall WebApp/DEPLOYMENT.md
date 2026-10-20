# RollCall WebApp deployment

Every portal loads Firebase configuration at request time from the existing RollCall Worker’s `/firebase-config` JavaScript endpoint. This uses the Worker’s Cloudflare runtime variables directly, so no generated config file, Pages Function, or build command is required. Localhost uses the same endpoint.

## Firebase Worker variables

Configure these under the existing `rollcall-worker` Worker’s **Settings > Variables and Secrets**. These are public Firebase web-app settings, not private credentials:

| Variable | Required | Purpose |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Yes | Firebase Web API key |
| `FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `FIREBASE_DATABASE_URL` | Yes | Realtime Database URL |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | Yes | Messaging sender ID |
| `FIREBASE_APP_ID` | Yes | Firebase web app ID |
| `FIREBASE_MEASUREMENT_ID` | No | Analytics measurement ID |
| `PUBLIC_BASE_URL` | For profile uploads | HTTPS base URL serving profile photos |

Set these on the Worker itself, not only on the Pages project. The Worker API key is the public Firebase Web API key; never configure the Firebase service-account JSON or Brevo key as frontend config.

## Cloudflare Pages

- Deploy the static app from either the repository root or `RollCall WebApp`; no build command is needed for Firebase configuration.
- The browser loads configuration from the existing Worker, so Pages build/runtime variables are not used for Firebase initialization. Localhost uses that same Worker endpoint; it does not read Cloudflare variables from the local machine.
- Deploy the updated `cloudflare/profile-upload-worker` source to the existing Worker. If a required Worker variable is missing, `/firebase-config` returns a clear JavaScript error naming it.
- If an older `/firebase-config` response omits the profile-upload URLs, the browser derives them from that script's HTTPS Worker URL. This does not replace deploying the updated Worker with the authenticated, signed-upload `POST`/`PUT` routes and the required R2 configuration.
- Profile images are uploaded through the authenticated Cloudflare Worker in `cloudflare/profile-upload-worker`; client-visible Firebase R2 endpoint, token, and access-key settings are no longer used by these upload flows.
- Owner school registration creates the administrator in Firebase Authentication and links the account to `users/{uid}`, `schoolAdmins/{schoolId}`, and the school record. The administrator email must not already belong to another Firebase Authentication account.
- Administrator security PINs and database-management verification are stored per school/college at `schoolSettings/{schoolId}/securityPinHash`; no global administrator PIN is used.

## Netlify

The static site can also be hosted on other providers because Firebase configuration is loaded from the existing Cloudflare Worker.

Firebase web configuration is returned to browsers and is public by design. Do not put service-account keys, Admin SDK credentials, or other private secrets in these variables. Protect data with Firebase Authentication and Realtime Database/Storage security rules.

## Existing Cloudflare Worker

Profile photos, password-reset emails, and Firebase web configuration use the existing `https://rollcall-worker.divyanshugupta415.workers.dev/` Worker; no second Worker hostname is required. The configuration endpoint derives the upload Worker URL from its request URL and uses `PUBLIC_BASE_URL` for public profile photos.

The updated Worker source in `cloudflare/profile-upload-worker` keeps the existing `/file/...` image-serving route and two-step `POST`/`PUT` upload contract, while adding Firebase ID-token verification and short-lived signed upload URLs. Deploy it as the existing Worker (`name = "rollcall-worker"`), keep the existing `PROFILE_PHOTOS` R2 binding and bucket, and include every consuming site's exact origin in `ALLOWED_ORIGINS`. The Worker includes `http://localhost:3000`, `https://rollinn.netlify.app`, `https://geetakalp.onrender.com`, and `https://rollcall.codesynq.me` as defaults; add any other sites as comma-separated origins in the Worker configuration. Requests from unlisted origins are rejected for API routes and preflight, and are not granted cross-origin access to photos.

The Worker cannot stop interception on a compromised device, extension, endpoint security tool, or trusted local certificate. HTTPS/TLS protects requests in transit; a server-delivered Content Security Policy and strict Firebase rules are still needed to reduce script injection and unauthorized database writes.

## Brevo password-reset delivery

The same Worker handles `/password-reset`. It asks Firebase Authentication to create a real password-reset action link, then sends the transactional email through Brevo's SMTP API. The link remains a Firebase action link; Brevo is only the delivery provider. Campaign creation credentials and list IDs are not used.

1. In Cloudflare Worker settings, add `FIREBASE_DATABASE_URL`, `FIREBASE_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` as non-secret variables. Use the Firebase project's Realtime Database URL, Web API key, and a sender verified in Brevo.
2. Add these as **Worker secrets**, never web-app build variables or checked-in files:

   ```sh
   npx wrangler secret put BREVO_API_KEY
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
   npx wrangler secret put R2_UPLOAD_SIGNING_SECRET
   ```

   `FIREBASE_SERVICE_ACCOUNT_JSON` is the complete JSON key for a service account from the same Firebase project. Grant the service account the Firebase Authentication Admin permission required to generate action links. `R2_UPLOAD_SIGNING_SECRET` should be a long, randomly generated value. Keep and rotate these secrets only through Cloudflare's secret manager.
3. Deploy the updated source to the existing `rollcall-worker` Worker. The browser helper calls `https://rollcall-worker.divyanshugupta415.workers.dev/password-reset` on the same host already used for photos.
4. Add a Cloudflare rate-limiting rule for the Worker's `/password-reset` route (for example, a small per-IP limit) to reduce abuse of the unauthenticated “forgot password” form. The Worker returns the same generic success message whether or not an account exists.

Signed-in administrators can request resets only for users in their own school. Signed-in users can request their own reset; the public login recovery form can submit an email without signing in. Never put the Brevo key or Firebase service-account JSON in `FIREBASE_*` web build variables.
