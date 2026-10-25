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
   - Licenses are issued from the RollCall Admin Panel (in **any mode**: School, College, Coaching, ERP).
   - Admin downloads `<school_code>-cbt-license.rolllic` and uploads it to the CBT client application to activate the device.

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
```
