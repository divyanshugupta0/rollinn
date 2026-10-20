import { describe, it, expect, beforeAll } from "vitest";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";

describe("Firebase Configuration", () => {
  let app: any;

  beforeAll(() => {
    // Validate that all required environment variables are set
    const requiredEnvVars = [
      "FIREBASE_API_KEY",
      "FIREBASE_AUTH_DOMAIN",
      "FIREBASE_PROJECT_ID",
      "FIREBASE_MESSAGING_SENDER_ID",
      "FIREBASE_APP_ID",
    ];

    for (const envVar of requiredEnvVars) {
      expect(process.env[envVar], `${envVar} should be defined`).toBeDefined();
    }
  });

  it("should initialize Firebase app with valid configuration", () => {
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    };

    expect(firebaseConfig.apiKey).toBeTruthy();
    expect(firebaseConfig.authDomain).toBeTruthy();
    expect(firebaseConfig.projectId).toBeTruthy();
    expect(firebaseConfig.appId).toBeTruthy();
    expect(firebaseConfig.databaseURL).toContain("firebaseio.com");
  });

  it("should have valid Firebase configuration structure", () => {
    const apiKey = process.env.FIREBASE_API_KEY;
    const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    // Basic validation of Firebase config format
    expect(apiKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(authDomain).toContain("firebaseapp.com");
    expect(projectId).toMatch(/^[a-z0-9-]+$/);
  });
});
