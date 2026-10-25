# RollCall CBT - Secure Computer-Based Testing System

RollCall CBT is a standalone, 100% offline Electron application engineered for high-security academic and entrance examinations. It pairs seamlessly with the RollCall Admin Portal to offer a tamper-proof assessment environment.

## Key Features

1. **100% Offline Air-Gapped Operation**:
   - No internet connection required in the exam hall.
   - All tests, student rosters, questions, and responses are transferred securely via encrypted `.rollcbt` and `.rollcbt-sub` files.

2. **Tamper-Proof `.rollcbt` Exam Packages**:
   - Exam packages are generated directly from the RollCall Admin Panel.
   - Includes full student roster (roll numbers, candidate names, batch/class, and secret PINs).
   - Question answer keys are encrypted with AES-256-CBC and protected by SHA-256 HMAC digital signatures, preventing students from inspecting local files or memory to view answers.

3. **Offline License Activation (`.rolllic`)**:
   - Licenses are issued only to schools with an active standalone CBT plan from the RollCall Admin Panel.
   - The school-scoped CBT license key is generated only for an active CBT plan, saved once, and reused until that plan expires.
   - Admin sets the activation start, expiry, and maximum device count.
   - The IDE accepts the license only when selected directly from removable external storage.
   - Teacher Exam Studio creates one section-specific scheduled assignment and encrypted exam file per checked section, including school details and the section roster.
   - Student rosters are sorted by class roll and split into equal contiguous device ranges from the active plan's maximum-device limit; each IDE only shows its assigned range.
   - Each activation consumes one device seat and writes a signed replacement license with the reduced count back to the same external device.
   - The final seat first replaces the file contents with a consumed marker containing no license details, then deletes the file; any recovered copy therefore fails license verification.
   - After expiry, the IDE remains active for a five-day grace period with renewal reminders; it locks automatically when that grace period ends.
   - Manual license-key activation and raw in-app license content activation are disabled.

4. **Kiosk Lockdown & Anti-Cheat Proctoring**:
   - Fullscreen kiosk lockdown prevents window switching, Alt+Tab, and unauthorized shortcuts.
   - Focus loss / window blur detection with live strike tracking (e.g. 3 strikes before termination).
   - Real-time webcam face proctoring verification.

5. **In-Exam Tools & Accessibility**:
   - Question palette with status indicators (Answered, Not Answered, Marked for Review, Review & Answered).
   - Built-in Scientific & Arithmetic Calculator (trigonometry, logarithms, powers, square root).
   - Rough Work Scratchpad auto-saved continuously.
   - Accessible font resizing (A- / A+).
   - Real-time local disk crash recovery.

6. **Official Digitally Signed Submissions (`.rollcbt-sub`)**:
   - Generates an encrypted, HMAC-signed submission record containing student responses, completion time, anti-cheat incident log, and score summary.
   - Instant printable scorecard with verification seal.

## Starting the Application

```bash
npm start
# or in development mode
npm run dev

# local-only testing license activation (does not consume USB seats)
npm run test-mode
```

In test mode, the activation screen shows **Temporary local test activation** and accepts a signed `.rolllic` file from the same computer. The temporary activation lasts 24 hours and is disabled in normal packaged production launches. To test the packaged executable, launch it with the `--test-license` argument.
