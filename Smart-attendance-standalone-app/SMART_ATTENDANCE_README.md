# Smart Attendance System

A modern React Native mobile application for managing student attendance using Firebase authentication and multiple verification methods.

## Features

### Authentication
- **Firebase Email/Password Authentication**: Secure user registration and login
- **Session Persistence**: Automatic session management with AsyncStorage
- **User Profile Management**: View and manage user account information

### Dashboard & Navigation
- **Class Listing**: View all enrolled classes with details
- **Class Information**: Access class schedule, location, and attendance method
- **Tab Navigation**: Easy navigation between Dashboard and Profile screens
- **Profile Screen**: User information, attendance statistics, and settings

### Attendance Verification Methods

The app supports four flexible attendance verification methods, all requiring location verification:

#### 1. Location Only
- GPS-based location verification
- Geofence validation (100-meter radius)
- Real-time distance display
- Automatic attendance recording

#### 2. Location + Face Recognition
- Location verification combined with face capture
- Face image storage capability
- Biometric authentication support
- Enhanced security for attendance marking

#### 3. Location + QR Code
- Location verification with QR code scanning
- QR code validation and display
- Instructor-generated QR codes for each class
- Quick and efficient attendance marking

#### 4. Location + Code
- Location verification with alphanumeric code entry
- Code validation (4-10 characters)
- Real-time code display
- Instructor-provided attendance codes

## Technical Stack

- **Frontend**: React Native with Expo SDK 54
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **State Management**: React Context + Hooks
- **Backend**: Firebase (Authentication, Realtime Database)
- **Location Services**: Expo Location API
- **Testing**: Vitest with comprehensive unit tests
- **Type Safety**: TypeScript

## Project Structure

```
smart-attendance-app/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab navigation layout
│   │   ├── index.tsx            # Dashboard screen
│   │   └── profile.tsx          # Profile screen
│   ├── auth/
│   │   ├── login.tsx            # Login screen
│   │   └── register.tsx         # Register screen
│   ├── _layout.tsx              # Root layout with providers
│   ├── class-details.tsx        # Class details screen
│   ├── attendance-location.tsx  # Location verification
│   ├── attendance-face.tsx      # Face recognition
│   ├── attendance-qr.tsx        # QR code scanning
│   ├── attendance-code.tsx      # Code entry
│   └── attendance-success.tsx   # Success confirmation
├── lib/
│   ├── firebase.ts              # Firebase configuration
│   ├── auth-context.tsx         # Authentication context
│   ├── database-context.tsx     # Database operations
│   ├── location-context.tsx     # Location services
│   └── utils.ts                 # Utility functions
├── components/
│   ├── screen-container.tsx     # SafeArea wrapper
│   ├── haptic-tab.tsx           # Tab with haptics
│   └── ui/
│       └── icon-symbol.tsx      # Icon mapping
├── hooks/
│   ├── use-auth.ts              # Auth hook
│   ├── use-colors.ts            # Theme colors hook
│   └── use-color-scheme.ts      # Dark mode hook
├── assets/
│   └── images/
│       ├── icon.png             # App icon
│       ├── splash-icon.png      # Splash screen
│       └── favicon.png          # Web favicon
├── app.test.ts                  # Comprehensive tests
└── app.config.ts                # Expo configuration
```

## Firebase Setup

### Required Firestore/Realtime Database Structure

```
classes/
├── {classId}
│   ├── name: string
│   ├── instructorName: string
│   ├── code: string
│   ├── startTime: string
│   ├── endTime: string
│   ├── location:
│   │   ├── name: string
│   │   ├── latitude: number
│   │   └── longitude: number
│   └── attendanceMethod:
│       └── type: "location" | "location+face" | "location+qr" | "location+code"

attendance/
├── {attendanceId}
│   ├── userId: string
│   ├── classId: string
│   ├── timestamp: number
│   ├── method: string
│   ├── location:
│   │   ├── latitude: number
│   │   └── longitude: number
│   ├── status: "present" | "absent"
│   ├── qrCode?: string
│   ├── code?: string
│   └── faceImage?: string
```

## Environment Variables

Create a `.env` file with your Firebase configuration:

```
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_DATABASE_URL=your_database_url
```

## Installation & Setup

### Prerequisites
- Node.js 18+ and pnpm
- Expo CLI
- Firebase project setup
- iOS/Android development environment (for native testing)

### Steps

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Configure Firebase**
   - Create a Firebase project at https://firebase.google.com
   - Enable Authentication (Email/Password)
   - Set up Realtime Database
   - Add your credentials to `.env`

3. **Run Development Server**
   ```bash
   pnpm dev
   ```

4. **Test on Device**
   - iOS: `pnpm ios`
   - Android: `pnpm android`
   - Web: `pnpm dev:metro` (opens at http://localhost:8081)

5. **Run Tests**
   ```bash
   pnpm test
   ```

## Key Features Explained

### Location Verification
- Uses device GPS to get current location
- Calculates distance to class location using Haversine formula
- Validates if user is within 100-meter geofence
- Prevents attendance marking outside class location

### Authentication Flow
1. User registers with email and password
2. Firebase Auth creates user account
3. User logs in with credentials
4. Auth state persists across app sessions
5. Automatic redirect to login if not authenticated

### Attendance Recording
1. User selects a class from dashboard
2. Views class details and attendance method
3. Verifies location (required for all methods)
4. Completes method-specific verification
5. Attendance record saved to Firebase
6. Success confirmation displayed

## Testing

The app includes comprehensive unit tests covering:

- **Authentication**: Email validation, password requirements
- **Location Services**: Distance calculation, geofence validation
- **Attendance Methods**: Code validation, QR format, method types
- **Class Information**: Structure validation, time format
- **Error Handling**: Location errors, submission validation
- **Data Validation**: Input sanitization, method type validation

Run tests with:
```bash
pnpm test
```

## Performance Optimizations

- **Lazy Loading**: Screens load on demand
- **Memoization**: Context values memoized to prevent unnecessary re-renders
- **Efficient Lists**: FlatList used for class listings
- **Haptic Feedback**: Subtle feedback for user interactions
- **Error Boundaries**: Graceful error handling throughout

## Security Considerations

- Firebase Authentication handles password security
- Location data validated before attendance recording
- User sessions managed securely with AsyncStorage
- Environment variables protect sensitive credentials
- Input sanitization for code entry

## Future Enhancements

- Real face recognition integration with ML Kit
- QR code scanner with native camera integration
- Real-time attendance statistics
- Push notifications for class reminders
- Offline attendance marking with sync
- Multiple language support
- Attendance history and analytics
- Instructor dashboard for attendance management

## Troubleshooting

### Location Permission Issues
- Ensure location permissions are granted in device settings
- Check that location services are enabled
- Verify GPS signal availability

### Firebase Connection Issues
- Verify Firebase credentials in `.env`
- Check internet connectivity
- Ensure Firebase Realtime Database rules allow read/write

### Build Issues
- Clear node_modules: `rm -rf node_modules && pnpm install`
- Clear Expo cache: `expo start --clear`
- Check TypeScript errors: `pnpm check`

## License

This project is part of the Smart Attendance System initiative.

## Support

For issues or questions, please contact the development team or submit an issue in the project repository.

---

**Version**: 1.0.0  
**Last Updated**: February 21, 2026  
**Status**: Production Ready
