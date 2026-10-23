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
- Administrator security PINs and database-management verification are stored per school/college at `schoolSettings/{schoolId}/securityPinHash`; no global administrator PIN is used. ERP institution admins skip the PIN setup at login and are restricted to Manage Account in the admin portal.

## Netlify

The static site can also be hosted on other providers because Firebase configuration is loaded from the existing Cloudflare Worker.

Firebase web configuration is returned to browsers and is public by design. Do not put service-account keys, Admin SDK credentials, or other private secrets in these variables. Protect data with Firebase Authentication and Realtime Database/Storage security rules.

## Existing Cloudflare Worker

Profile photos, password-reset emails, and Firebase web configuration use the existing `https://rollcall-worker.divyanshugupta415.workers.dev/` Worker; no second Worker hostname is required. The configuration endpoint derives the upload Worker URL from its request URL and uses `PUBLIC_BASE_URL` for public profile photos.

The updated Worker source in `cloudflare/profile-upload-worker` keeps the existing `/file/...` image-serving route and two-step `POST`/`PUT` upload contract, while adding Firebase ID-token verification and short-lived signed upload URLs. Deploy it as the existing Worker (`name = "rollcall-worker"`), keep the existing `PROFILE_PHOTOS` R2 binding and bucket, and include every consuming site's exact origin in `ALLOWED_ORIGINS`. The Worker includes `http://localhost:3000`, `https://rollinn.netlify.app`, `https://geetakalp.onrender.com`, and `https://rollcall.codesynq.me` as defaults; add any other sites as comma-separated origins in the Worker configuration. Requests from unlisted origins are rejected for API routes and preflight, and are not granted cross-origin access to photos.

The Worker also handles the authenticated `/delete-teacher` route used by the school admin portal. It verifies that the caller is an administrator and the target teacher belongs to the same school, removes the teacher's Firebase Authentication account, profile, profile photo, notifications, and class-teacher assignment entries, and retains attendance records, leave/profile requests, and locations as history. The service account must have Firebase Authentication user-delete permission and Realtime Database access. The admin portal requires the administrator to type the teacher's email before deletion.

The Worker also provides `/erp-license/portal` for authenticated school admins and `/erp-license/verify` for RollCall ERP activation. School registration identifies ERP accounts with the **RollCall ERP** institution type, which is stored on the school and administrator profile. ERP mode is restricted to the admin portal and is determined by that institution type. Owner pricing plans have a **Plan type** field; subscription expiry/grace dialogs use it only to list matching active main plans (School, College, or ERP). The license endpoint issues one random school access code for an ERP subscription and reuses it on portal reloads and logins while its current term remains unexpired; changes to plan metadata or a renewal before expiry update the license record without changing its code. After a term expires, the Worker retains a non-secret expiration marker and removes the old code from the verification index. A replacement code is issued only when the owner has an active subscription whose end date extends beyond the previous term; an expired or inactive subscription cannot issue or verify a code. Firebase stores the code's SHA-256 lookup hash and AES-GCM-encrypted copy while active; the encryption key must be a 32-byte hex value set as the `ERP_LICENSE_ENCRYPTION_KEY` Worker secret. The verification endpoint requires both the registered school code and the access code, and checks the current subscription and dates against Firebase. Expired code material is retired by the Worker’s 15-minute scheduled cleanup. Apply both `auth/firebase-rules.json` and `auth/updated_firebase_rules.json` rules changes before deploying; authenticated users linked to an owner’s school can read that owner’s pricing-plan catalogue for renewal options, while plan writes remain owner-only and license paths have no browser read/write grants.

The RollCall ERP desktop app calls `POST /erp-license/verify` at `https://rollcall-worker.divyanshugupta415.workers.dev/erp-license/verify` with the registered `schoolCode` and the ERP `code`. Create/open a school archive and activate it in the full-screen activation gate. After successful online verification, the app stores the code and expiry in Electron's OS-protected local storage and saves the registration school code in the school file. The Worker returns the school and subscription dates plus a non-secret license number derived from the access-code hash; the desktop admin profile displays these values read-only. An expired subscription remains usable for five days; the app shows a renewal reminder during that grace period and then blocks ERP features until a renewed access code is verified. The Worker secret and updated Worker must be deployed before activation will succeed.

The admin portal's **Teacher Sections** panel supports class-and-section-specific class-teacher access and subject-teacher assignments. **Manage Timetable** configures school days and the number/names of class intervals, then calculates shared period times between the school's start and end times. Admins can insert a lunch break after any interval and enter a custom duration; leaving its duration blank uses approximately one class interval. These school-wide times appear above each admin and teacher timetable grid, and the lunch break is shown as a shared column. Each configured class section keeps its own weekly lesson grid. Configure class names, sections, and subjects in **Manage Courses** and **Manage Subjects** before setting assignments and timetables. Timetable writes are administrator-only in the UI; verify the corresponding database rules enforce school and role boundaries before deployment.

The Worker cannot stop interception on a compromised device, extension, endpoint security tool, or trusted local certificate. HTTPS/TLS protects requests in transit; a server-delivered Content Security Policy and strict Firebase rules are still needed to reduce script injection and unauthorized database writes.

## Brevo password-reset delivery

The same Worker handles `/password-reset`. It asks Firebase Authentication to create a real password-reset action link, then sends a branded HTML and plain-text transactional email through Brevo's HTTPS API. The link remains a Firebase action link; Brevo is only the delivery provider. Campaign creation credentials and list IDs are not used. The email uses a text RollCall wordmark; a sender avatar shown by a recipient's email provider is configured separately and is not controlled by the email template.

1. In Cloudflare Worker settings, add `FIREBASE_DATABASE_URL`, `FIREBASE_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` as non-secret variables. Use the Firebase project's Realtime Database URL, Web API key, and a sender verified in Brevo.
2. Add these as **Worker secrets**, never web-app build variables or checked-in files:

   ```sh
   npx wrangler secret put BREVO_API_KEY
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
   npx wrangler secret put R2_UPLOAD_SIGNING_SECRET
   npx wrangler secret put ERP_LICENSE_ENCRYPTION_KEY
   ```

   `FIREBASE_SERVICE_ACCOUNT_JSON` is the complete JSON key for a service account from the same Firebase project. Grant the service account the Firebase Authentication Admin permission required to generate action links. `R2_UPLOAD_SIGNING_SECRET` should be a long, randomly generated value. `ERP_LICENSE_ENCRYPTION_KEY` must be a randomly generated 32-byte key represented as exactly 64 hexadecimal characters; keep the same value for as long as encrypted license codes exist, or invalidate/reissue those codes before rotating it. Keep and rotate these secrets only through Cloudflare's secret manager.
   Generate the ERP key locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, then paste its 64-character output when Wrangler prompts for the value. Run the Wrangler command from `rollapp/cloudflare/profile-upload-worker` so it targets the configured `rollcall-worker`. Do not put the generated value in source files, Firebase web configuration, or chat. After setting it, verify the secret name with `npx wrangler secret list`; the value is intentionally not displayed.
3. Deploy the updated source to the existing `rollcall-worker` Worker. The browser helper calls `https://rollcall-worker.divyanshugupta415.workers.dev/password-reset` on the same host already used for photos.
4. Add a Cloudflare rate-limiting rule for the Worker's `/password-reset` route (for example, a small per-IP limit) to reduce abuse of the unauthenticated “forgot password” form. The Worker returns the same generic success message whether or not an account exists.

Signed-in administrators can request resets only for users in their own school. Signed-in users can request their own reset; the public login recovery form can submit an email without signing in. Never put the Brevo key or Firebase service-account JSON in `FIREBASE_*` web build variables.
