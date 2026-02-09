# Student Registration Portal

## Overview
This is a web application for managing student registrations and tracking progress on TryHackMe courses.

## Features
- Firebase Authentication
- Admin login via Realtime Database
- Student registration
- Course link assignment
- Basic progress tracking

## Setup Instructions

### Prerequisites
- A modern web browser
- Firebase Account

### Firebase Configuration
1. Go to https://console.firebase.google.com/
2. Create a new project
3. Enable Authentication (Email/Password)
4. Enable Realtime Database
5. Go to Project Settings > Add App > Web App
6. Copy the Firebase configuration

### Creating Admin Users
1. In Firebase Console, go to Authentication
2. Create a user account for the admin
3. Go to Realtime Database
4. Manually add admin users:
   - Navigate to the "admins" node
   - Add a new child node with the user's UID as the key
   - Example structure:
     ```
     {
       "admins": {
         "USER_UID_HERE": true
       }
     }
     ```

### How to Find User UID
1. After creating a user, sign in once
2. Open browser console
3. Run: `firebase.auth().currentUser.uid`
4. Copy this UID to the Realtime Database

### Local Setup
1. Clone this repository
2. Replace Firebase config in `script.js`
3. Open `tryhackme.html` in a web browser

## Limitations
- Progress tracking is a placeholder
- Requires TryHackMe API integration for full functionality

## Future Improvements
- Implement advanced authentication
- Add real-time progress tracking
- Create more robust error handling
- Add student individual progress view

## Troubleshooting
- Ensure Firebase config is correctly copied
- Verify admin user is added to Realtime Database
- Check browser console for detailed error messages

## Technologies Used
- HTML5
- CSS3
- JavaScript
- Firebase Authentication
- Firebase Realtime Database
- Firebase Firestore

## License
MIT License 
