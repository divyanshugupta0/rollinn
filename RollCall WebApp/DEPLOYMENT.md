# RollCall WebApp deployment

Every portal reads one Firebase project configuration from the generated file `auth/firebase-config.runtime.js`. The build creates that file from deployment environment variables, so Firebase settings do not need to be copied into portal source files.

## Build settings

Set the following variables in the build environment for production and preview deployments:

| Variable | Required | Firebase value |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Yes | Web API key |
| `FIREBASE_AUTH_DOMAIN` | Yes | Auth domain |
| `FIREBASE_DATABASE_URL` | Yes | Realtime Database URL |
| `FIREBASE_PROJECT_ID` | Yes | Project ID |
| `FIREBASE_STORAGE_BUCKET` | Yes | Storage bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | Yes | Messaging sender ID |
| `FIREBASE_APP_ID` | Yes | Web app ID |
| `FIREBASE_MEASUREMENT_ID` | No | Analytics measurement ID |
| `PROFILE_UPLOAD_WORKER_URL` | For profile uploads | HTTPS URL of the deployed profile-upload Worker |
| `PROFILE_PHOTO_PUBLIC_BASE_URL` | For profile uploads | HTTPS custom domain serving the R2 profile-photo bucket |

Run the build from the `RollCall WebApp` directory:

```sh
npm run build
```

The build command is `node scripts/generate-firebase-config.mjs`. It writes the runtime file into `auth/`; that generated file is ignored by Git and must be regenerated for each deployment.

## Cloudflare Pages

- Set the project root or base directory to `RollCall WebApp`.
- Set the build command to `npm run build`.
- Set the output directory to `.`.
- Add the `FIREBASE_*` values under the Pages build environment variables for production and preview as needed.
- Profile images are uploaded through the authenticated Cloudflare Worker in `cloudflare/profile-upload-worker`; client-visible Firebase R2 endpoint, token, and access-key settings are no longer used by these upload flows.
- Owner school registration creates the administrator in Firebase Authentication and links the account to `users/{uid}`, `schoolAdmins/{schoolId}`, and the school record. The administrator email must not already belong to another Firebase Authentication account.
- Administrator security PINs and database-management verification are stored per school/college at `schoolSettings/{schoolId}/securityPinHash`; no global administrator PIN is used.

## Netlify

- Set the base directory to `RollCall WebApp`.
- Set the build command to `npm run build`.
- Set the publish directory to `.`.
- Add the `FIREBASE_*` values in the site's environment variables, with build scope enabled.

Firebase web configuration is delivered to browsers and is public by design. Do not put service account keys, Admin SDK credentials, or other server secrets in these variables. Protect data with Firebase Authentication and Realtime Database/Storage security rules.

## Existing Cloudflare Worker

Profile photos and password-reset emails use the existing `https://rollcall-worker.divyanshugupta415.workers.dev/` Worker; no second Worker hostname is required. Defaults are included in the generated Firebase runtime config. Override `PROFILE_UPLOAD_WORKER_URL` and `PROFILE_PHOTO_PUBLIC_BASE_URL` only when using a different deployment.

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
