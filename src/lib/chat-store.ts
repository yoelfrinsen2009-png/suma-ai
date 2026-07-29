"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase.ts";
import type { UserCopilot, UserMood } from "./user-store.ts";

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  createdAtMs: number;
  inScope?: boolean;
  error?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  copilot: UserCopilot;
  mood: UserMood;
  messageCount: number;
  lastMessage: string;
  createdAtMs: number;
  updatedAtMs: number;
};

const SESSION_LIMIT = 50;
const DELETE_BATCH_SIZE = 400;

function sessionsPath(uid: string) {
  const { db } = getFirebaseServices();
  return collection(db, "users", uid, "sessions");
}

function messagesPath(uid: string, sessionId: string) {
  const { db } = getFirebaseServices();
  return collection(db, "users", uid, "sessions", sessionId, "messages");
}

function safeMessage(message: StoredChatMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content.slice(0, 50_000),
    time: message.time,
    createdAtMs: message.createdAtMs,
    inScope: message.inScope ?? true,
    error: message.error ?? false,
    createdAt: serverTimestamp(),
  };
}

export function makeSessionTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "Percakapan baru";
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
}

export function formatSessionTime(updatedAtMs: number): string {
  if (!updatedAtMs) return "Baru";
  const date = new Date(updatedAtMs);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Kemarin";
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function subscribeToSessions(
  uid: string,
  onChange: (sessions: ChatSession[]) => void,
  onError: (error: Error) => void,
) {
  const sessionsQuery = query(
    sessionsPath(uid),
    orderBy("updatedAtMs", "desc"),
    firestoreLimit(SESSION_LIMIT),
  );

  return onSnapshot(sessionsQuery, (snapshot) => {
    onChange(snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        title: typeof data.title === "string" ? data.title : "Percakapan",
        copilot: data.copilot === "d4shgrd" ? "d4shgrd" : "sum-ai",
        mood: ["Baik", "Fokus", "Santai", "Galak"].includes(data.mood)
          ? data.mood as UserMood
          : "Baik",
        messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
        lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : "",
        createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : 0,
        updatedAtMs: typeof data.updatedAtMs === "number" ? data.updatedAtMs : 0,
      };
    }));
  }, (error) => onError(error));
}

export async function createChatSession(
  uid: string,
  copilot: UserCopilot,
  mood: UserMood,
  firstMessage: StoredChatMessage,
): Promise<string> {
  const { db } = getFirebaseServices();
  const sessionReference = doc(sessionsPath(uid));
  const messageReference = doc(messagesPath(uid, sessionReference.id), firstMessage.id);
  const batch = writeBatch(db);

  batch.set(sessionReference, {
    title: makeSessionTitle(firstMessage.content),
    copilot,
    mood,
    messageCount: 1,
    lastMessage: firstMessage.content.slice(0, 300),
    createdAtMs: firstMessage.createdAtMs,
    updatedAtMs: firstMessage.createdAtMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(messageReference, safeMessage(firstMessage));
  await batch.commit();
  return sessionReference.id;
}

export async function appendChatMessage(
  uid: string,
  sessionId: string,
  message: StoredChatMessage,
): Promise<void> {
  const { db } = getFirebaseServices();
  const sessionReference = doc(db, "users", uid, "sessions", sessionId);
  const messageReference = doc(messagesPath(uid, sessionId), message.id);
  const batch = writeBatch(db);

  batch.set(messageReference, safeMessage(message));
  batch.update(sessionReference, {
    lastMessage: message.content.slice(0, 300),
    messageCount: increment(1),
    updatedAtMs: message.createdAtMs,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function loadChatSession(uid: string, sessionId: string): Promise<StoredChatMessage[]> {
  const messagesQuery = query(messagesPath(uid, sessionId), orderBy("createdAtMs", "asc"));
  const snapshot = await getDocs(messagesQuery);
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    const role = data.role === "user" || data.role === "assistant" ? data.role : null;
    if (!role || typeof data.content !== "string") return [];
    return [{
      id: item.id,
      role,
      content: data.content,
      time: typeof data.time === "string" ? data.time : "",
      createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : 0,
      inScope: data.inScope !== false,
      error: data.error === true,
    } satisfies StoredChatMessage];
  });
}

export async function deleteChatSession(uid: string, sessionId: string): Promise<void> {
  const { db } = getFirebaseServices();
  const messageCollection = messagesPath(uid, sessionId);

  while (true) {
    const snapshot = await getDocs(query(messageCollection, firestoreLimit(DELETE_BATCH_SIZE)));
    if (snapshot.empty) break;
    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }

  await deleteDoc(doc(db, "users", uid, "sessions", sessionId));
}
