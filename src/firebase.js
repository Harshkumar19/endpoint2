// src/firebase.js
import admin from "firebase-admin";
import { readFileSync } from "fs";

// Read the service account key JSON file
const serviceAccount = JSON.parse(
  readFileSync(new URL("./config/serviceAccountKey.json", import.meta.url))
);

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Get Firestore database instance
const db = admin.firestore(); // Use admin.firestore() to get the Firestore instance

// Export the database instance
export const getDb = () => db;
