"use client";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const hasClientConfig = Boolean(config.apiKey && config.projectId);

export function getClientApp(): FirebaseApp | null {
  if (!hasClientConfig) return null;
  return getApps().length ? getApp() : initializeApp(config);
}

export function getClientDb(): Firestore | null {
  const app = getClientApp();
  return app ? getFirestore(app) : null;
}
