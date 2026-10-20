# Smart Attendance System - Mobile App Design

## Overview
A mobile app for managing student/employee attendance using Firebase Authentication and Realtime Database. The app supports four distinct attendance verification methods based on class configuration.

## Screen List

1. **Splash/Loading Screen** - Initial app load with branding
2. **Login Screen** - Email/password authentication via Firebase
3. **Register Screen** - New user account creation
4. **Dashboard** - Main screen showing active classes and attendance status
5. **Class Details Screen** - View class information and selected attendance method
6. **Attendance Methods Screen** - Choose attendance method based on class configuration
7. **Location Only Screen** - Verify attendance by location coordinates
8. **Location + Face Recognition Screen** - Location + biometric/face verification
9. **Location + QR Code Screen** - Scan QR code at location
10. **Location + Code Screen** - Enter numeric/alphanumeric code at location
11. **Attendance Success Screen** - Confirmation after successful check-in
12. **Profile Screen** - User profile and settings

## Primary Content and Functionality

### Dashboard Screen
- **Content**: List of active/upcoming classes with attendance status
- **Cards**: Each class shows:
  - Class name and time
  - Instructor name
  - Attendance status (Not Started, In Progress, Completed)
  - Available attendance method icon
- **Actions**: Tap class card to view details and mark attendance

### Class Details Screen
- **Content**: Full class information
- **Elements**:
  - Class name, code, time, location
  - Instructor details
  - Attendance method type (icon + label)
  - Current attendance status
  - "Mark Attendance" button

### Attendance Methods Screen
- **Content**: Display the required attendance method for the class
- **Method Types**:
  1. **Location Only**: Show map with geofence, current location, distance to class
  2. **Location + Face Recognition**: Location verification + camera for face capture
  3. **Location + QR Code**: Location verification + QR scanner UI
  4. **Location + Code**: Location verification + code input field

### Location Only Screen
- **Content**: 
  - Map showing class location and current position
  - Distance indicator
  - Status message (In range / Out of range)
  - Submit button (enabled when in range)

### Location + Face Recognition Screen
- **Content**:
  - Map/location status at top
  - Camera preview for face capture
  - "Capture Face" button
  - Status: "Waiting for face..." → "Face detected" → "Processing..."
  - Submit button (enabled when face captured and location verified)

### Location + QR Code Screen
- **Content**:
  - Location status at top
  - QR code scanner view
  - "Scan QR Code" instruction
  - Scanned code display
  - Submit button (enabled when code scanned and location verified)

### Location + Code Screen
- **Content**:
  - Location status at top
  - Large numeric input field
  - Numeric keypad or text input
  - "Submit Code" button (enabled when code entered and location verified)

### Attendance Success Screen
- **Content**:
  - Success checkmark animation
  - "Attendance Marked Successfully" message
  - Timestamp of check-in
  - Class details summary
  - "Back to Dashboard" button

### Profile Screen
- **Content**:
  - User avatar/initials
  - Name, email, ID
  - Attendance statistics (classes attended, total classes)
  - Settings options
  - Logout button

## Key User Flows

### Flow 1: Mark Attendance (Location Only)
1. User opens app → Dashboard
2. Taps active class card
3. Views class details
4. Taps "Mark Attendance"
5. Sees location verification screen
6. Current location checked against geofence
7. If in range → "Submit" button enabled
8. Taps submit → Success screen
9. Returns to dashboard

### Flow 2: Mark Attendance (Location + Face Recognition)
1. User opens app → Dashboard
2. Taps active class card
3. Views class details
4. Taps "Mark Attendance"
5. Sees location + camera screen
6. Location verified (in range)
7. Camera activates, user positions face
8. Face detected and captured
9. Taps submit → Success screen
10. Returns to dashboard

### Flow 3: Mark Attendance (Location + QR Code)
1. User opens app → Dashboard
2. Taps active class card
3. Views class details
4. Taps "Mark Attendance"
5. Sees location + QR scanner screen
6. Location verified (in range)
7. QR scanner activates
8. User scans instructor's QR code
9. Code captured and validated
10. Taps submit → Success screen
11. Returns to dashboard

### Flow 4: Mark Attendance (Location + Code)
1. User opens app → Dashboard
2. Taps active class card
3. Views class details
4. Taps "Mark Attendance"
5. Sees location + code input screen
6. Location verified (in range)
7. Instructor provides code verbally/visually
8. User enters code in input field
9. Taps submit → Success screen
10. Returns to dashboard

### Authentication Flow
1. App launches → Check if user logged in
2. If not → Login screen
3. User enters email/password
4. Firebase authenticates
5. If successful → Dashboard
6. If failed → Error message, retry

## Color Choices

### Brand Colors
- **Primary**: `#0a7ea4` (Teal blue) - Main actions, highlights
- **Secondary**: `#06b6d4` (Cyan) - Alternative accent
- **Success**: `#22c55e` (Green) - Attendance confirmed, success states
- **Warning**: `#f59e0b` (Amber) - Out of range, warnings
- **Error**: `#ef4444` (Red) - Failed attempts, errors

### Semantic Colors
- **Background**: `#ffffff` (Light) / `#151718` (Dark)
- **Surface**: `#f5f5f5` (Light) / `#1e2022` (Dark)
- **Text Primary**: `#11181c` (Light) / `#ecedee` (Dark)
- **Text Secondary**: `#687076` (Light) / `#9ba1a6` (Dark)
- **Border**: `#e5e7eb` (Light) / `#334155` (Dark)

### Status Indicators
- **In Range**: Green (`#22c55e`)
- **Out of Range**: Amber (`#f59e0b`)
- **Pending**: Gray (`#9ba1a6`)
- **Completed**: Teal (`#0a7ea4`)

## Layout Principles

- **Portrait Orientation (9:16)**: All screens designed for portrait mobile use
- **One-Handed Usage**: Critical buttons positioned in lower half of screen
- **Safe Area**: Content respects notch and home indicator
- **Spacing**: 16px base unit for padding and margins
- **Typography**: 
  - Headings: 24-32px, bold
  - Body: 16px, regular
  - Labels: 14px, medium
- **Touch Targets**: Minimum 44x44pt for interactive elements
- **Card-Based Layout**: Classes and information presented in card format
- **Progressive Disclosure**: Show essential info first, details on tap

## Navigation Structure

```
Authentication Stack
├── Login Screen
├── Register Screen
└── Forgot Password Screen

Main Stack (After Auth)
├── Dashboard (Home)
│   └── Class Details
│       └── Attendance Methods
│           ├── Location Only
│           ├── Location + Face
│           ├── Location + QR
│           └── Location + Code
│           └── Success Screen
├── Profile
└── Settings
```

## Firebase Integration Points

1. **Authentication**: Firebase Auth for login/register
2. **Realtime Database**: 
   - Read class schedule and methods
   - Write attendance records
   - Monitor attendance status
3. **Data Structure**:
   - `users/{uid}/profile` - User information
   - `users/{uid}/attendance` - Attendance history
   - `classes/{classId}` - Class details and method
   - `attendance/{classId}/{uid}` - Attendance records

## Accessibility Considerations

- High contrast between text and background
- Large touch targets (44x44pt minimum)
- Clear visual feedback for all interactions
- Haptic feedback on successful actions
- Screen reader support for critical elements
- Clear error messages and recovery paths
