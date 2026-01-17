// Firebase Cloud Functions for sending location verification emails
// Deploy this to Firebase Functions to enable email functionality

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configure your email service (Gmail example)
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com', // Replace with your email
        pass: 'your-app-password'     // Replace with your app password
    }
});

exports.sendLocationEmail = functions.https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if user is admin
    const adminSnapshot = await admin.database().ref(`admins/${context.auth.uid}`).once('value');
    if (!adminSnapshot.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'User must be an admin');
    }

    const { email, token } = data;

    if (!email || !token) {
        throw new functions.https.HttpsError('invalid-argument', 'Email and token are required');
    }

    // Create the location capture URL
    const locationUrl = `https://your-domain.com/location-capture.html?token=${token}&email=${encodeURIComponent(email)}`;
    
    const mailOptions = {
        from: 'your-email@gmail.com',
        to: email,
        subject: 'Location Verification Required - RollCall',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0; font-size: 28px;">RollCall</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px;">Location Verification Request</p>
                </div>
                <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #1e293b; margin-bottom: 20px;">Share Your Location</h2>
                    <p style="color: #475569; line-height: 1.6; margin-bottom: 25px;">
                        You have been requested to share your location for attendance verification purposes. 
                        Please click the button below to securely share your current location.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${locationUrl}" style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                            📍 Share My Location
                        </a>
                    </div>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <h3 style="color: #1e293b; margin: 0 0 10px 0; font-size: 16px;">Important Notes:</h3>
                        <ul style="color: #475569; margin: 0; padding-left: 20px;">
                            <li>This link will expire in 24 hours</li>
                            <li>Your location will only be used for attendance verification</li>
                            <li>Your privacy and data security are our top priority</li>
                            <li>You can only use this link once</li>
                        </ul>
                    </div>
                    <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
                        If you did not expect this email, please ignore it. The link will expire automatically.
                    </p>
                </div>
                <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
                    <p>© 2024 RollCall. All rights reserved.</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true, message: 'Email sent successfully' };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send email');
    }
});

// Function to clean up expired location requests
exports.cleanupExpiredRequests = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const now = Date.now();
    const requestsRef = admin.database().ref('locationRequests');
    
    const snapshot = await requestsRef.once('value');
    const requests = snapshot.val();
    
    if (!requests) return;
    
    const expiredTokens = [];
    
    Object.keys(requests).forEach(token => {
        if (requests[token].expiresAt < now) {
            expiredTokens.push(token);
        }
    });
    
    // Remove expired requests
    const updates = {};
    expiredTokens.forEach(token => {
        updates[token] = null;
    });
    
    if (Object.keys(updates).length > 0) {
        await requestsRef.update(updates);
        console.log(`Cleaned up ${Object.keys(updates).length} expired location requests`);
    }
    
    return null;
});