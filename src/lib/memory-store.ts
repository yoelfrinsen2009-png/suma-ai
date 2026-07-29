"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase.ts";
import type { MemoryCategory, MemoryDraft } from "./personal-memory.ts";

export type PersonalMemory = {
  key: string;
  label: string;
  value: string;
  category: MemoryCategory;
  source: "chat" | "manual";
  createdAtMs: number;
  updatedAtMs: number;
};

export const PERSONAL_MEMORY_LIMIT = 50;

function memoriesPath(uid: string) {
  const { db } = getFirebaseServices();
  return collection(db, "users", uid, "memories");
}

export function subscribeToMemories(
  uid: string,
  onChange: (memories: PersonalMemory[]) => void,
  onError: (error: Error) => void,
) {
  const memoryQuery = query(memoriesPath(uid), orderBy("updatedAtMs", "desc"), firestoreLimit(PERSONAL_MEMORY_LIMIT));
  return onSnapshot(memoryQuery, (snapshot) => {
    onChange(snapshot.docs.flatMap((item) => {
      const data = item.data();
      if (typeof data.label !== "string" || typeof data.value !== "string") return [];
      const category: MemoryCategory = ["identity", "location", "work", "preference", "other"].includes(data.category)
        ? data.category as MemoryCategory
        : "other";
      return [{
        key: item.id,
        label: data.label,
        value: data.value,
        category,
        source: data.source === "manual" ? "manual" : "chat",
        createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : 0,
        updatedAtMs: typeof data.updatedAtMs === "number" ? data.updatedAtMs : 0,
      } satisfies PersonalMemory];
    }));
  }, (error) => onError(error));
}

export async function savePersonalMemory(uid: string, memory: MemoryDraft, source: "chat" | "manual" = "chat"): Promise<void> {
  const { db } = getFirebaseServices();
  const reference = doc(db, "users", uid, "memories", memory.key);
  const existing = await getDoc(reference);
  const now = Date.now();
  await setDoc(reference, {
    key: memory.key,
    label: memory.label.slice(0, 80),
    value: memory.value.slice(0, 1000),
    category: memory.category,
    source,
    createdAtMs: existing.exists() && typeof existing.data().createdAtMs === "number" ? existing.data().createdAtMs : now,
    updatedAtMs: now,
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deletePersonalMemory(uid: string, key: string): Promise<void> {
  const { db } = getFirebaseServices();
  await deleteDoc(doc(db, "users", uid, "memories", key));
}

export async function clearPersonalMemories(uid: string): Promise<void> {
  const { db } = getFirebaseServices();
  while (true) {
    const snapshot = await getDocs(query(memoriesPath(uid), firestoreLimit(400)));
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}
