/**
 * Smart GlycoVitals Logger — Firebase Profile Initialization Script
 * 
 * Usage:
 *   1. Install dependencies: npm install firebase-admin
 *   2. Download your Firebase service account key from:
 *      Firebase Console → Project Settings → Service Accounts → Generate New Private Key
 *   3. Save the downloaded JSON as "serviceAccountKey.json" in this folder
 *   4. Run: node init-firebase-profiles.js
 *
 * This script uses update() so it will NOT overwrite existing glucose readings.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // ← Replace with your key path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://smart-glycovitals-logger-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const db = admin.database();

// ─────────────────────────────────────────────
// Patient profiles (flat structure — no nesting
// under "profile" key to match AuthContext read)
// ─────────────────────────────────────────────
const PATIENT_PROFILES = {
  U001: {
    name: 'Aarav Sharma', age: 34, diabetesType: 'Type 2',
    email: 'aarav.sharma@gmail.com', phone: '9876543210',
    pin: '0000', gender: 'Male', bloodGroup: 'B+',
    emergencyContact: '9876543211', createdAt: '2025-06-15',
    memberSince: 'June 2025',
  },
  U002: {
    name: 'Priya Patel', age: 28, diabetesType: 'Type 1',
    email: 'priya.patel@gmail.com', phone: '9845612370',
    pin: '0000', gender: 'Female', bloodGroup: 'A+',
    emergencyContact: '9845612371', createdAt: '2025-07-20',
    memberSince: 'July 2025',
  },
  U003: {
    name: 'Rohit Verma', age: 45, diabetesType: 'Type 2',
    email: 'rohit.verma@gmail.com', phone: '9765432180',
    pin: '0000', gender: 'Male', bloodGroup: 'O+',
    emergencyContact: '9765432181', createdAt: '2025-05-10',
    memberSince: 'May 2025',
  },
  U004: {
    name: 'Sneha Iyer', age: 31, diabetesType: 'Pre-diabetic',
    email: 'sneha.iyer@gmail.com', phone: '9823456710',
    pin: '0000', gender: 'Female', bloodGroup: 'AB+',
    emergencyContact: '9823456711', createdAt: '2025-08-05',
    memberSince: 'August 2025',
  },
  U005: {
    name: 'Karan Mehta', age: 52, diabetesType: 'Type 2',
    email: 'karan.mehta@gmail.com', phone: '9712345678',
    pin: '0000', gender: 'Male', bloodGroup: 'B-',
    emergencyContact: '9712345679', createdAt: '2025-04-18',
    memberSince: 'April 2025',
  },
  U006: {
    name: 'Divya Nair', age: 26, diabetesType: 'Type 1',
    email: 'divya.nair@gmail.com', phone: '9634567812',
    pin: '0000', gender: 'Female', bloodGroup: 'O-',
    emergencyContact: '9634567813', createdAt: '2025-09-12',
    memberSince: 'September 2025',
  },
  U007: {
    name: 'Amit Joshi', age: 41, diabetesType: 'Type 2',
    email: 'amit.joshi@gmail.com', phone: '9556781234',
    pin: '0000', gender: 'Male', bloodGroup: 'A-',
    emergencyContact: '9556781235', createdAt: '2025-03-22',
    memberSince: 'March 2025',
  },
  U008: {
    name: 'Meera Reddy', age: 38, diabetesType: 'Type 2',
    email: 'meera.reddy@gmail.com', phone: '9478901234',
    pin: '0000', gender: 'Female', bloodGroup: 'B+',
    emergencyContact: '9478901235', createdAt: '2025-10-08',
    memberSince: 'October 2025',
  },
  U009: {
    name: 'Vikram Singh', age: 29, diabetesType: 'Pre-diabetic',
    email: 'vikram.singh@gmail.com', phone: '9390123456',
    pin: '0000', gender: 'Male', bloodGroup: 'AB-',
    emergencyContact: '9390123457', createdAt: '2025-11-30',
    memberSince: 'November 2025',
  },
  U010: {
    name: 'Ananya Gupta', age: 33, diabetesType: 'Type 1',
    email: 'ananya.gupta@gmail.com', phone: '9212345678',
    pin: '0000', gender: 'Female', bloodGroup: 'O+',
    emergencyContact: '9212345679', createdAt: '2025-12-15',
    memberSince: 'December 2025',
  },
};

const DOCTOR = {
  DOC001: {
    name: 'Dr. Rajesh Kumar',
    specialization: 'Diabetologist',
    hospital: 'City Diabetes Care Center',
    email: 'dr.rajesh@hospital.com',
    phone: '9811122233',
    pin: '1234',
    createdAt: '2025-01-01',
  },
};

async function initProfiles() {
  console.log('🚀 Smart GlycoVitals Logger — Firebase Profile Initialization\n');

  // Update patients
  for (const [uid, profile] of Object.entries(PATIENT_PROFILES)) {
    try {
      // update() merges — existing readings/predictions are untouched
      await db.ref(`users/${uid}`).update(profile);
      console.log(`  ✅ ${uid} — ${profile.name}`);
    } catch (err) {
      console.error(`  ❌ ${uid} — ${err.message}`);
    }
  }

  // Update doctor
  for (const [did, doc] of Object.entries(DOCTOR)) {
    try {
      await db.ref(`doctors/${did}`).update(doc);
      console.log(`  ✅ ${did} — ${doc.name}`);
    } catch (err) {
      console.error(`  ❌ ${did} — ${err.message}`);
    }
  }

  console.log('\n✅ Done! All profiles updated. Existing readings are safe.\n');
  process.exit(0);
}

initProfiles().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
