"use client";

import type { User } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase.ts";

export type UserCopilot = "sum-ai" | "d4shgrd";
export type UserMood = "Baik" | "Fokus" | "Santai" | "Galak";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  copilot: UserCopilot;
  mood: UserMood;
  onboarded: boolean;
  memoryEnabled: boolean;
  memoryDefaultApplied: boolean;
};

export const PENDING_REGISTRATION_KEY = "sumai-pending-registration";

const validCopilots: UserCopilot[] = ["sum-ai", "d4shgrd"];
const validMoods: UserMood[] = ["Baik", "Fokus", "Santai", "Galak"];

function pendingRegistrationName(user: User): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = sessionStorage.getItem(PENDING_REGISTRATION_KEY);
    if (!raw) return "";
    const pending = JSON.parse(raw) as { email?: unknown; displayName?: unknown };
    return pending.email === user.email && typeof pending.displayName === "string"
      ? pending.displayName.trim()
      : "";
  } catch {
    return "";
  }
}

function clearPendingRegistration(user: User) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(PENDING_REGISTRATION_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw) as { email?: unknown };
    if (pending.email === user.email) sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
  } catch {
    sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
  }
}

function defaultProfile(user: User): UserProfile {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName?.trim() || pendingRegistrationName(user) || user.email?.split("@")[0] || "Pengguna SUMA-AI",
    role: "Pengguna SUMA-AI",
    copilot: "sum-ai",
    mood: "Baik",
    onboarded: false,
    memoryEnabled: true,
    memoryDefaultApplied: true,
  };
}

function normalizeProfile(user: User, data: Record<string, unknown>): UserProfile {
  const fallback = defaultProfile(user);
  return {
    uid: user.uid,
    email: typeof data.email === "string" ? data.email : fallback.email,
    displayName: typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : fallback.displayName,
    role: typeof data.role === "string" && data.role.trim()
      ? data.role.trim()
      : fallback.role,
    copilot: validCopilots.includes(data.copilot as UserCopilot)
      ? data.copilot as UserCopilot
      : fallback.copilot,
    mood: validMoods.includes(data.mood as UserMood)
      ? data.mood as UserMood
      : fallback.mood,
    onboarded: data.onboarded === true,
    // Profil dari versi lama belum memiliki penanda migrasi. Aktifkan sekali,
    // lalu hormati pilihan pengguna pada login-login berikutnya.
    memoryEnabled: data.memoryDefaultApplied === true ? data.memoryEnabled !== false : true,
    memoryDefaultApplied: true,
  };
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const { db } = getFirebaseServices();
  const reference = doc(db, "users", user.uid);
  const snapshot = await getDoc(reference);

  if (snapshot.exists()) {
    const storedProfile = normalizeProfile(user, snapshot.data());
    const profile = {
      ...storedProfile,
      email: user.email ?? storedProfile.email,
      displayName: user.displayName?.trim() || storedProfile.displayName,
      role: storedProfile.role === "Pengguna SUM-AI" ? "Pengguna SUMA-AI" : storedProfile.role,
    };
    await setDoc(reference, {
      uid: user.uid,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      memoryEnabled: profile.memoryEnabled,
      memoryDefaultApplied: true,
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    clearPendingRegistration(user);
    return profile;
  }

  const profile = defaultProfile(user);
  await setDoc(reference, {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });
  clearPendingRegistration(user);
  return profile;
}

export async function saveUserProfile(
  uid: string,
  changes: Partial<Pick<UserProfile, "displayName" | "role" | "copilot" | "mood" | "onboarded" | "memoryEnabled">>,
): Promise<void> {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "users", uid), {
    ...changes,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
