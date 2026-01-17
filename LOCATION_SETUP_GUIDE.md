# Location Capture System Setup Guide

## Overview
The location capture system allows admins to send email links to users for mobile location verification. When users click the link on their mobile device, their GPS coordinates are captured and stored in Firebase.

## Files Created/Modified

### 1. `admin-with-location.html`
- Complete admin panel with "Fetch Mobile Coordinates" button
- Modal for entering email addresses
- Firebase integration for sending location requests

### 2. `location-capture.html` (Updated)
- Mobile-friendly location capture page
- Updated with correct Firebase configuration
- Captures GPS coordinates and saves to Firebase

### 3. `firebase-functions-template.js`
- Template for Firebase Cloud Functions to send emails
- Includes email template and cleanup functions

## Setup Instructions

### Step 1: Replace Your Current Admin File
1. Backup your current `admin.html`
2. Replace it with `admin-with-location.html` or merge the location functionality

### Step 2: Firebase Database Structure
The system uses this Firebase Realtime Database structure:
```
locationRequests/
  ├── loc_1234567890_abc123/
  │   ├── email: "user@example.com"
  │   ├── token: "loc_1234567890_abc123"
  │   ├── createdAt: 1234567890000
  │   ├── expiresAt: 1234567890000
  │   ├── status: "pending" | "completed"
  │   ├── adminUid: "admin-user-id"
  │   └── location: {
  │       ├── latitude: 12.345678
  │       ├── longitude: 98.765432
  │       ├── accuracy: 10
  │       ├── timestamp: 1234567890000
  │       ├── userAgent: "Mozilla/5.0..."
  │       └── deviceType: "mobile" | "desktop"
  │   }
```

### Step 3: Firebase Security Rules
Add these rules to your Firebase Realtime Database:
```json
{
  "rules": {
    "locationRequests": {
      "$token": {
        ".read": true,
        ".write": "auth != null && (root.child('admins').child(auth.uid).exists() || data.child('status').val() == 'pending')"
      }
    },
    "admins": {
      ".read": "auth != null && root.child('admins').child(auth.uid).exists()",
      ".write": false
    }
  }
}
```

### Step 4: Email Functionality (Optional)
For production use, deploy the Firebase Cloud Function:

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Initialize functions: `firebase init functions`
3. Copy `firebase-functions-template.js` content to `functions/index.js`
4. Install dependencies: `cd functions && npm install nodemailer`
5. Configure email credentials in the function
6. Deploy: `firebase deploy --only functions`

### Step 5: Update Admin Panel JavaScript
If you want to use the cloud function for email sending, update the `sendLocationVerificationEmail` function in the admin panel:

```javascript
function sendLocationVerificationEmail(email, token) {
    const sendEmail = firebase.functions().httpsCallable('sendLocationEmail');
    return sendEmail({ email: email, token: token });
}
```

## How It Works

1. **Admin clicks "Fetch Mobile Coordinates"**
   - Modal opens asking for email address
   - Admin enters user's email and clicks "Send Email"

2. **System generates location request**
   - Creates unique token
   - Saves request to Firebase with 24-hour expiration
   - Sends email with location capture link

3. **User receives email**
   - Email contains link to `location-capture.html?token=xxx&email=xxx`
   - Link expires in 24 hours

4. **User clicks link on mobile device**
   - Opens location capture page
   - Requests GPS permission
   - Captures and saves coordinates to Firebase
   - Updates request status to "completed"

5. **Admin can view results**
   - Check Firebase database for completed location requests
   - View captured coordinates and device information

## Testing Without Email
For testing, you can:
1. Generate a token manually in the browser console
2. Create the location request in Firebase manually
3. Navigate directly to: `location-capture.html?token=YOUR_TOKEN&email=test@example.com`

## Security Features
- Tokens expire after 24 hours
- Each token can only be used once
- Admin authentication required
- Location data includes accuracy and timestamp
- Device type detection (mobile/desktop)

## Troubleshooting
- Ensure Firebase configuration is correct in both files
- Check browser console for JavaScript errors
- Verify Firebase security rules allow the operations
- Test location permissions on mobile devices
- Check that HTTPS is used for location capture (required by browsers)

## Future Enhancements
- Add admin dashboard to view captured locations
- Implement location verification against known coordinates
- Add SMS sending option for mobile numbers
- Create location history and analytics
- Add geofencing capabilities