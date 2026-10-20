# Teacher attendance workspace

The teacher attendance page now starts with an admin-style daily records workspace: date, class/location and status filters, search, summary counts, grouped records, and CSV export. The attendance dialog uses one roster/session UI for manual and student-wise marking, checkbox bulk actions, saved drafts, submission, and locking. Attendance records remain compatible with `attendance_by_location/{classId}/{YYYY-MM-DD}` and add `_meta.schoolId`, state and audit fields. Drafts use `attendance_drafts/{classId}/{date}`.

## Required enrollment fields

The UI uses school-specific indexes instead of listing the global collections. These paths must be populated by a trusted administrator enrollment/migration process. To appear in a teacher's roster:

- Teacher profile: `role: "teacher"`, `schoolId`.
- Class/location: `schoolId` matching the teacher. Class may include `name`, `className`, or `section`.
- Student: `role: "student"`, matching `schoolId`, and at least one matching `classId`, `locationId`, `enrolledClassId`, `courseId`, `className`, `courseName`, `subject`, or `section` value.
- School indexes: `schoolLocations/{schoolId}/{locationId}`, `schoolClasses/{schoolId}/{classId}`, and `schoolUsers/{schoolId}/{studentUid}`.

Existing records need an administrator-run migration to assign verified school and enrollment identifiers and populate those three indexes. Do not let students self-assign an arbitrary school ID; enrollment needs a trusted school invite or administrator workflow. Until that migration is complete, the teacher roster and counts may be empty by design.

## External integrations and security boundary

The existing project has no Firebase Functions package, deployment configuration, or configured map, QR scanner, or mail service. Location and QR modes therefore report that verification is unavailable; they never claim a check-in was verified. Email report delivery reports that no mail service is configured.

The current `auth/firebase-rules.json` and `auth/updated_firebase_rules.json` still grant broad authenticated reads and writes (including student profiles and attendance). Frontend scoping only limits what the teacher panel displays; it cannot prevent direct Firebase REST/SDK access. **Do not treat this as a complete privacy/security fix or production-ready authorization.** A secure rollout requires replacing the broad rules with tested school-scoped authorization and a tenant-indexed enrollment path (Realtime Database rules cannot filter a root collection by both role and school), migrating existing records, and deploying trusted Functions for identity/enrollment validation, session state transitions, corrections, location checks, QR anti-replay and immutable audit events. No security-rule file has been deployed by this code change.

## Validation performed

The modified JavaScript files pass `node --check`; both inline scripts in `teacher.html` parse. A Firebase emulator or configured backend is not present in this workspace, so persisted workflows, authorization denial, responsive browser behavior, and concurrent submissions still require integration testing against a migrated test database.
