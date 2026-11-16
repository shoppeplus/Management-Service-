/**
 * Firebase Admin SDK Configuration
 * ---------------------------------
 * Initializes the Firebase Admin SDK using environment variables.
 * If credentials are not configured (demo/dev mode), the app starts
 * without Firebase and logs a warning — the frontend still works with mock data.
 *
 * Exports: db, auth, admin, isFirebaseReady
 */

import admin from 'firebase-admin';

let db = null;
let auth = null;
let isFirebaseReady = false;

// Check whether real Firebase credentials are present
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

const hasCredentials =
  projectId &&
  projectId !== 'your-project-id' &&
  clientEmail &&
  clientEmail !== 'your-client-email' &&
  privateKeyRaw &&
  privateKeyRaw !== 'your-private-key';

if (hasCredentials) {
  try {
    // Replace literal "\n" sequences with actual newlines (PEM format)
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }

    db = admin.firestore();
    auth = admin.auth();
    isFirebaseReady = true;
    console.log('✅ Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.warn('⚠️  Firebase initialization failed:', err.message);
    console.warn('   The server will run in DEMO mode (mock data only).');
  }
} else {
  console.warn('⚠️  Firebase credentials not configured in .env');
  console.warn('   The server is running in DEMO mode — frontend works with mock data.');
  console.warn('   To connect Firebase, fill in real values in your .env file.');
}

export { db, auth, admin, isFirebaseReady };
