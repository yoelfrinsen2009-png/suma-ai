<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as updateFirebaseProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import UiIcon from "./components/UiIcon.vue";
import { getFirebaseServices, isFirebaseConfigured, missingFirebaseConfig } from "./lib/firebase.ts";
import {
  appendChatMessage,
  createChatSession,
  deleteChatSession,
  formatSessionTime,
  loadChatSession,
  subscribeToSessions,
} from "./lib/chat-store.ts";
import type { ChatSession, StoredChatMessage } from "./lib/chat-store.ts";
import {
  clearPersonalMemories,
  deletePersonalMemory,
  PERSONAL_MEMORY_LIMIT,
  savePersonalMemory,
  subscribeToMemories,
} from "./lib/memory-store.ts";
import type { PersonalMemory } from "./lib/memory-store.ts";
import {
  answerPersonalMemoryQuestion,
  buildPersonalMemoryContext,
  createManualMemory,
  extractPersonalMemories,
  isMemoryOnlyCommand,
  mergeMemories,
} from "./lib/personal-memory.ts";
import {
  ANALYSIS_FILE_ACCEPT,
  formatFileSize,
  prepareAnalysisFile,
} from "./lib/file-analysis.ts";
import type { AnalysisAttachment } from "./lib/file-analysis.ts";
import { sendScopedChat, SCOPE_REFUSAL } from "./lib/n8n-ai.ts";
import {
  ensureUserProfile,
  PENDING_REGISTRATION_KEY,
  saveUserProfile,
} from "./lib/user-store.ts";
import type { UserCopilot, UserMood, UserProfile } from "./lib/user-store.ts";

type AuthMode = "login" | "register";
type DialogKind = "settings" | "memory" | "history" | "logout" | "switch" | null;
type ChatMessage = StoredChatMessage;

const copilotData = {
  "sum-ai": {
    name: "SUMA-AI",
    role: "Partner analitik yang tenang & cekatan",
    image: "/sum-ai-mascot.png",
    accent: "orange",
    tags: ["Tenang", "Cermat", "Analitis", "Terstruktur"],
    benefits: ["Analisis data mendalam & akurat", "Membantu pembuatan proposal", "Ringkasan terstruktur", "Navigasi internal yang detail"],
  },
  d4shgrd: {
    name: "D4SHGRD",
    role: "Robot asisten yang gesit & to the point",
    image: "/d4shgrd-mascot.png",
    accent: "purple",
    tags: ["Cepat", "Ringkas", "Praktis", "Solutif"],
    benefits: ["Jawaban cepat & ringkas", "Aksi langsung", "Fokus ke solusi", "Navigasi efisien"],
  },
} as const;

const navItems = [
  ["home", "Beranda"],
  ["chat", "Chat"],
  ["chart", "Analisa Data"],
  ["list", "Ringkasan SW1H"],
  ["compass", "Navigasi Halaman"],
  ["headset", "Arahkan ke IT"],
] as const;

const quickActions = [
  ["chart", "Analisa Data"],
  ["list", "Ringkasan SW1H"],
  ["compass", "Navigasi Halaman"],
  ["headset", "Arahkan ke IT"],
] as const;

const suggestionSets = [
  ["Apa faktor utama yang memengaruhi kelayakan?", "Tampilkan segmentasi risiko", "Buat rekomendasi mitigasi"],
  ["Bandingkan dengan bulan lalu", "Jelaskan anomali terbesar", "Buat versi untuk manajemen"],
  ["Tampilkan sumber datanya", "Ringkas dalam lima poin", "Susun rencana tindak lanjut"],
];

const sw1hItems = [
  ["What", "Apa", "Analisis kelayakan proposal saldo dan risiko pembayaran"],
  ["Who", "Siapa", "Tim Kredit, Risk Management, dan pemilik proposal"],
  ["When", "Kapan", "Dianalisis hari ini dan dapat diperbarui kapan saja"],
  ["Where", "Di mana", "Workspace SUMA-AI dengan data perusahaan"],
  ["Why", "Mengapa", "Memastikan keputusan akurat dan terukur"],
  ["How", "Bagaimana", "Validasi data, pemodelan risiko, lalu rekomendasi mitigasi"],
] as const;

const modules = [
  ["chart", "Analisa Data", "Olah dataset dan temukan insight."],
  ["list", "Ringkasan SW1H", "Susun informasi dalam enam pertanyaan kunci."],
  ["activity", "Proposal Kredit", "Tanyakan status dan risiko proposal."],
  ["compass", "Dashboard Risiko", "Lihat risiko portofolio secara menyeluruh."],
  ["headset", "Pusat Bantuan IT", "Laporkan masalah akses atau sistem."],
  ["home", "Beranda", "Kembali ke ringkasan aktivitas harian."],
] as const;

const user = ref<User | null>(null);
const authReady = ref(!isFirebaseConfigured);
const profile = ref<UserProfile | null>(null);
const profileError = ref("");
const authMode = ref<AuthMode>("login");
const authName = ref("");
const authEmail = ref("");
const authPassword = ref("");
const authConfirmation = ref("");
const authBusy = ref(false);
const authError = ref("");
const authNotice = ref("");

const selectedCopilot = ref<UserCopilot>("sum-ai");
const onboardingMemory = ref(false);
const onboardingBusy = ref(false);

const copilot = ref<UserCopilot>("sum-ai");
const mood = ref<UserMood>("Baik");
const activeView = ref("Chat");
const sidebarOpen = ref(false);
const profileOpen = ref(false);
const dialog = ref<DialogKind>(null);
const promptValue = ref("");
const messages = ref<ChatMessage[]>([]);
const sessions = ref<ChatSession[]>([]);
const memories = ref<PersonalMemory[]>([]);
const currentSessionId = ref<string | null>(null);
const loading = ref(false);
const toast = ref("");
const historySearch = ref("");
const moduleSearch = ref("");
const suggestionIndex = ref(0);
const selectedAttachment = ref<AnalysisAttachment | null>(null);
const attachmentBusy = ref(false);
const chatEnd = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const datasetInput = ref<HTMLInputElement | null>(null);
const datasetName = ref("");

const settingsName = ref("");
const settingsRole = ref("");
const memoryLabel = ref("");
const memoryValue = ref("");
const memoryBusy = ref(false);
const switchCopilot = ref<UserCopilot>("sum-ai");
const switchMood = ref<UserMood>("Baik");
const ticketCategory = ref("Akses akun");
const ticketPriority = ref("Normal");
const ticketDescription = ref("");
const ticketNumber = ref("");

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let requestController: AbortController | null = null;
let unsubscribeAuth: (() => void) | null = null;
let unsubscribeSessions: (() => void) | null = null;
let unsubscribeMemories: (() => void) | null = null;

const activeCopilot = computed(() => copilotData[copilot.value]);
const initials = computed(() => profile.value?.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SU");
const filteredSessions = computed(() => sessions.value.filter((session) => session.title.toLowerCase().includes(historySearch.value.toLowerCase())));
const filteredModules = computed(() => modules.filter(([, title, copy]) => `${title} ${copy}`.toLowerCase().includes(moduleSearch.value.toLowerCase())));
const summaryText = computed(() => sw1hItems.map(([, label, text]) => `${label}: ${text}`).join("\n"));
const attachmentName = computed(() => selectedAttachment.value?.name ?? "");
const attachmentMeta = computed(() => {
  const attachment = selectedAttachment.value;
  if (!attachment) return "";
  const mode = attachment.mode === "inline" ? "multimodal" : attachment.summary;
  return `${formatFileSize(attachment.size)} · ${mode}${attachment.truncated ? " · dipotong" : ""}`;
});

function notify(message: string) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ""; }, 2800);
}

function clearAttachment() {
  selectedAttachment.value = null;
  datasetName.value = "";
  if (fileInput.value) fileInput.value.value = "";
  if (datasetInput.value) datasetInput.value.value = "";
}

async function selectAnalysisFile(file: File | undefined, kind: "attachment" | "dataset") {
  if (!file || attachmentBusy.value || loading.value) return;
  attachmentBusy.value = true;
  notify(`Membaca ${file.name}...`);
  try {
    const prepared = await prepareAnalysisFile(file);
    selectedAttachment.value = prepared;
    datasetName.value = prepared.name;
    if (!promptValue.value.trim() || kind === "dataset") {
      promptValue.value = prepared.sourceType.includes("spreadsheet") || prepared.sourceType.includes("csv")
        ? `Analisis file ${prepared.name}: temukan tren, anomali, pola penting, dan risiko utama.`
        : `Analisis file ${prepared.name} dan jelaskan temuan utama berdasarkan isinya.`;
    }
    notify(`${prepared.name} siap dianalisis${prepared.truncated ? " dengan sebagian konten" : ""}`);
  } catch (error) {
    clearAttachment();
    notify(error instanceof Error ? error.message : "File tidak berhasil dibaca.");
  } finally {
    attachmentBusy.value = false;
    if (fileInput.value) fileInput.value.value = "";
    if (datasetInput.value) datasetInput.value.value = "";
  }
}

function randomId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function friendlyAuthError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const messagesByCode: Record<string, string> = {
    "auth/email-already-in-use": "Email ini sudah terdaftar. Silakan masuk.",
    "auth/invalid-credential": "Email atau kata sandi salah.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/missing-password": "Kata sandi wajib diisi.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
    "auth/user-disabled": "Akun ini telah dinonaktifkan.",
    "auth/weak-password": "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.",
  };
  return messagesByCode[code] ?? (error instanceof Error ? error.message : "Autentikasi gagal. Silakan coba lagi.");
}

function changeAuthMode(next: AuthMode) {
  authMode.value = next;
  authError.value = "";
  authNotice.value = "";
  authPassword.value = "";
  authConfirmation.value = "";
}

async function submitAuth() {
  authError.value = "";
  authNotice.value = "";
  if (!isFirebaseConfigured) return;
  if (authMode.value === "register" && authName.value.trim().length < 2) {
    authError.value = "Nama lengkap minimal 2 karakter.";
    return;
  }
  if (authPassword.value.length < 8) {
    authError.value = "Kata sandi minimal 8 karakter.";
    return;
  }
  if (authMode.value === "register" && authPassword.value !== authConfirmation.value) {
    authError.value = "Konfirmasi kata sandi tidak sama.";
    return;
  }

  authBusy.value = true;
  try {
    const { auth, db } = getFirebaseServices();
    await setPersistence(auth, browserLocalPersistence);
    if (authMode.value === "register") {
      const cleanEmail = authEmail.value.trim();
      const cleanName = authName.value.trim();
      sessionStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify({ email: cleanEmail, displayName: cleanName }));
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, authPassword.value);
      await updateFirebaseProfile(credential.user, { displayName: cleanName });
      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        email: credential.user.email ?? cleanEmail,
        displayName: cleanName,
        role: "Pengguna SUMA-AI",
        copilot: "sum-ai",
        mood: "Baik",
        onboarded: false,
        memoryEnabled: true,
        memoryDefaultApplied: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
    } else {
      await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
    }
  } catch (error) {
    authError.value = friendlyAuthError(error);
  } finally {
    authBusy.value = false;
  }
}

async function resetPassword() {
  authError.value = "";
  authNotice.value = "";
  if (!authEmail.value.trim()) {
    authError.value = "Isi email terlebih dahulu untuk mengatur ulang kata sandi.";
    return;
  }
  authBusy.value = true;
  try {
    const { auth } = getFirebaseServices();
    await sendPasswordResetEmail(auth, authEmail.value.trim());
    authNotice.value = "Tautan pengaturan ulang kata sandi sudah dikirim ke email.";
  } catch (error) {
    authError.value = friendlyAuthError(error);
  } finally {
    authBusy.value = false;
  }
}

function stopDataSubscriptions() {
  unsubscribeSessions?.();
  unsubscribeMemories?.();
  unsubscribeSessions = null;
  unsubscribeMemories = null;
}

function startDataSubscriptions() {
  stopDataSubscriptions();
  if (!user.value || !profile.value?.onboarded) return;
  unsubscribeSessions = subscribeToSessions(user.value.uid, (rows) => { sessions.value = rows; }, () => notify("Riwayat belum dapat dimuat. Periksa Firestore Rules."));
  unsubscribeMemories = subscribeToMemories(user.value.uid, (rows) => { memories.value = rows; }, () => notify("Memori belum dapat dimuat. Deploy Firestore Rules terbaru."));
}

async function loadProfile(account: User) {
  profileError.value = "";
  profile.value = null;
  try {
    const nextProfile = await ensureUserProfile(account);
    if (user.value?.uid !== account.uid) return;
    profile.value = nextProfile;
    selectedCopilot.value = nextProfile.copilot;
    onboardingMemory.value = nextProfile.memoryEnabled;
    copilot.value = nextProfile.copilot;
    mood.value = nextProfile.mood;
    startDataSubscriptions();
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : "Profil tidak dapat dimuat.";
  }
}

async function continueToWorkspace() {
  if (!user.value) return;
  onboardingBusy.value = true;
  try {
    const latest = await ensureUserProfile(user.value);
    await saveUserProfile(user.value.uid, { copilot: selectedCopilot.value, onboarded: true, memoryEnabled: onboardingMemory.value });
    profile.value = { ...latest, copilot: selectedCopilot.value, onboarded: true, memoryEnabled: onboardingMemory.value };
    copilot.value = selectedCopilot.value;
    mood.value = latest.mood;
    startDataSubscriptions();
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : "Pilihan copilot belum dapat disimpan.";
  } finally {
    onboardingBusy.value = false;
  }
}

async function logout() {
  dialog.value = null;
  profileOpen.value = false;
  stopDataSubscriptions();
  const { auth } = getFirebaseServices();
  await signOut(auth);
}

function setProfileChanges(changes: Partial<UserProfile>) {
  if (profile.value) profile.value = { ...profile.value, ...changes };
}

function openDialog(kind: Exclude<DialogKind, null>) {
  profileOpen.value = false;
  if (kind === "settings" && profile.value) {
    settingsName.value = profile.value.displayName;
    settingsRole.value = profile.value.role;
  }
  if (kind === "switch") {
    switchCopilot.value = copilot.value;
    switchMood.value = mood.value;
  }
  dialog.value = kind;
}

async function saveSettings() {
  if (!user.value || !settingsName.value.trim() || !settingsRole.value.trim()) return;
  try {
    await updateFirebaseProfile(user.value, { displayName: settingsName.value.trim() });
    await saveUserProfile(user.value.uid, { displayName: settingsName.value.trim(), role: settingsRole.value.trim() });
    setProfileChanges({ displayName: settingsName.value.trim(), role: settingsRole.value.trim() });
    dialog.value = null;
    notify("Pengaturan profil disimpan");
  } catch {
    notify("Profil belum berhasil disimpan");
  }
}

async function applyCopilot() {
  if (!user.value) return;
  try {
    await saveUserProfile(user.value.uid, { copilot: switchCopilot.value, mood: switchMood.value });
    copilot.value = switchCopilot.value;
    mood.value = switchMood.value;
    setProfileChanges({ copilot: switchCopilot.value, mood: switchMood.value });
    dialog.value = null;
    notify("Copilot berhasil diganti");
  } catch {
    notify("Pilihan copilot belum tersimpan");
  }
}

async function toggleMemory() {
  if (!user.value || !profile.value) return;
  const enabled = !profile.value.memoryEnabled;
  try {
    await saveUserProfile(user.value.uid, { memoryEnabled: enabled });
    setProfileChanges({ memoryEnabled: enabled });
    notify(enabled ? "Memori personal diaktifkan" : "Memori personal dinonaktifkan");
  } catch {
    notify("Pengaturan memori belum tersimpan");
  }
}

async function addManualMemory() {
  if (!user.value) return;
  const draft = createManualMemory(memoryLabel.value, memoryValue.value);
  if (!draft || memories.value.length >= PERSONAL_MEMORY_LIMIT) {
    notify("Memori tidak valid, penuh, atau mengandung data rahasia");
    return;
  }
  memoryBusy.value = true;
  try {
    await savePersonalMemory(user.value.uid, draft, "manual");
    memoryLabel.value = "";
    memoryValue.value = "";
    notify("Memori personal disimpan");
  } catch {
    notify("Memori belum berhasil disimpan");
  } finally {
    memoryBusy.value = false;
  }
}

async function removeMemory(memory: PersonalMemory) {
  if (!user.value) return;
  try {
    await deletePersonalMemory(user.value.uid, memory.key);
    notify("Memori personal dihapus");
  } catch {
    notify("Memori belum berhasil dihapus");
  }
}

async function removeAllMemories() {
  if (!user.value || !window.confirm("Hapus seluruh memori personal? Tindakan ini tidak dapat dibatalkan.")) return;
  try {
    await clearPersonalMemories(user.value.uid);
    notify("Seluruh memori personal dihapus");
  } catch {
    notify("Memori belum berhasil dihapus");
  }
}

async function runAnalysis(
  text: string,
  historySource: ChatMessage[] = messages.value,
  attachment: AnalysisAttachment | null = selectedAttachment.value,
) {
  if (!user.value || !profile.value) return;
  const prompt = text.trim() || (attachment ? `Analisis file ${attachment.name} berdasarkan isinya.` : "");
  if (!prompt || loading.value || requestController) return;
  const priorHistory = [...historySource];
  const requestAttachment = attachment;
  let analysisDelivered = false;
  const nowMs = Date.now();
  const time = new Date(nowMs).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const rawExtraction = extractPersonalMemories(prompt, profile.value.memoryEnabled);
  const existingMemoryKeys = new Set(memories.value.map((memory) => memory.key));
  let availableSlots = Math.max(0, PERSONAL_MEMORY_LIMIT - memories.value.length);
  const acceptedDrafts = rawExtraction.drafts.filter((draft) => {
    if (existingMemoryKeys.has(draft.key)) return true;
    if (availableSlots <= 0) return false;
    availableSlots -= 1;
    existingMemoryKeys.add(draft.key);
    return true;
  });
  const memoryLimitReached = acceptedDrafts.length < rawExtraction.drafts.length;
  const extraction = { ...rawExtraction, drafts: acceptedDrafts };
  const effectiveMemories = mergeMemories(memories.value, extraction.drafts);
  const visiblePrompt = requestAttachment
    ? `${prompt}\nLampiran: ${requestAttachment.name} (${formatFileSize(requestAttachment.size)})`
    : prompt;
  const userMessage: ChatMessage = { id: randomId("user"), role: "user", content: visiblePrompt, time, createdAtMs: nowMs };
  activeView.value = "Chat";
  promptValue.value = "";
  if (selectedAttachment.value === requestAttachment) clearAttachment();
  messages.value.push(userMessage);
  loading.value = true;
  const controller = new AbortController();
  requestController = controller;
  let persistedSessionId = currentSessionId.value;

  try {
    try {
      if (persistedSessionId) {
        await appendChatMessage(user.value.uid, persistedSessionId, userMessage);
      } else {
        persistedSessionId = await createChatSession(user.value.uid, copilot.value, mood.value, userMessage);
        currentSessionId.value = persistedSessionId;
      }
    } catch {
      messages.value.push({ id: randomId("storage-error"), role: "assistant", content: "Pesan tidak berhasil disimpan ke Firebase. Periksa konfigurasi Firestore dan aturan keamanannya, lalu coba lagi.", time, createdAtMs: Date.now(), error: true });
      notify("Pesan belum tersimpan");
      return;
    }

    const localAnswer = async (content: string) => {
      const assistantMessage: ChatMessage = { id: randomId("assistant"), role: "assistant", content, time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }), createdAtMs: Date.now(), inScope: true };
      messages.value.push(assistantMessage);
      try { await appendChatMessage(user.value!.uid, persistedSessionId!, assistantMessage); } catch { notify("Jawaban tampil, tetapi belum berhasil disimpan"); }
    };

    if (extraction.blocked) {
      await localAnswer("Saya tidak menyimpan informasi tersebut karena terdeteksi sebagai data rahasia. Jangan masukkan password, PIN, OTP, token, API key, NIK, nomor rekening, atau data kartu ke memori personal.");
      return;
    }

    let memorySaved = true;
    if (extraction.drafts.length > 0) {
      try {
        await Promise.all(extraction.drafts.map((memory) => savePersonalMemory(user.value!.uid, memory, "chat")));
        notify(`${extraction.drafts.length} memori personal disimpan`);
      } catch {
        memorySaved = false;
        notify("Memori personal belum berhasil disimpan");
      }
      if (memorySaved && extraction.explicit && !profile.value.memoryEnabled) {
        try {
          await saveUserProfile(user.value.uid, { memoryEnabled: true });
          setProfileChanges({ memoryEnabled: true });
        } catch {
          notify("Memori tersimpan, tetapi personalisasi belum aktif");
        }
      }
    }

    const memoryActive = profile.value.memoryEnabled || (extraction.explicit && extraction.drafts.length > 0 && memorySaved);
    const memoryResponse = answerPersonalMemoryQuestion(prompt, effectiveMemories, memoryActive);
    if (memoryResponse) {
      await localAnswer(memoryResponse);
      return;
    }
    if (isMemoryOnlyCommand(prompt) && rawExtraction.drafts.length > 0) {
      if (extraction.drafts.length === 0 && memoryLimitReached) {
        await localAnswer(`Memori personal sudah penuh (${PERSONAL_MEMORY_LIMIT} data). Hapus memori yang tidak diperlukan melalui menu profil → Memori personal.`);
        return;
      }
      await localAnswer(memorySaved
        ? `Baik, saya akan mengingat: ${extraction.drafts.map((memory) => `${memory.label} — ${memory.value}`).join("; ")}.${memoryLimitReached ? " Sebagian informasi lain tidak disimpan karena memori penuh." : ""} Kamu dapat mengelolanya melalui Profil → Memori personal.`
        : "Informasi dipahami, tetapi belum berhasil disimpan ke Firebase. Deploy Firestore Rules terbaru lalu coba kembali.");
      return;
    }

    const personalContext = memoryActive ? buildPersonalMemoryContext(effectiveMemories, profile.value.displayName, profile.value.role) : "";
    const conversationHistory = priorHistory.slice(personalContext ? -9 : -10).map(({ role, content }) => ({ role, content }));
    const history = personalContext ? [{ role: "user" as const, content: personalContext }, ...conversationHistory] : conversationHistory;
    const data = await sendScopedChat({
      message: prompt,
      history,
      copilot: copilot.value,
      mood: mood.value,
      ...(requestAttachment ? { attachment: requestAttachment } : {}),
    }, controller.signal);
    if (controller.signal.aborted) return;
    analysisDelivered = true;
    const assistantMessage: ChatMessage = {
      id: randomId("assistant"),
      role: "assistant",
      content: data.inScope === false ? SCOPE_REFUSAL : data.answer.trim() || "AI tidak mengirim jawaban. Silakan coba lagi.",
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      createdAtMs: Date.now(),
      inScope: data.inScope !== false,
    };
    messages.value.push(assistantMessage);
    try { await appendChatMessage(user.value.uid, persistedSessionId, assistantMessage); } catch { notify("Jawaban tampil, tetapi belum berhasil disimpan"); }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    const errorMessage: ChatMessage = {
      id: randomId("error"), role: "assistant", content: error instanceof Error ? error.message : "Terjadi gangguan saat menghubungi AI.",
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }), createdAtMs: Date.now(), error: true,
    };
    messages.value.push(errorMessage);
    if (persistedSessionId) {
      try { await appendChatMessage(user.value.uid, persistedSessionId, errorMessage); } catch { /* Jawaban tetap tampil di UI. */ }
    }
  } finally {
    if (requestAttachment && !analysisDelivered && !selectedAttachment.value) {
      selectedAttachment.value = requestAttachment;
      datasetName.value = requestAttachment.name;
    }
    if (requestController === controller) requestController = null;
    loading.value = false;
  }
}

function sendPrompt() {
  void runAnalysis(promptValue.value);
}

function quickAction(action: string) {
  const prompts: Record<string, string> = {
    "Analisa Data": "Tolong analisa proposal saldo, kelayakan kredit & risiko pembayaran.",
    "Ringkasan SW1H": "Buatkan ringkasan SW1H dari aktivitas terbaru.",
    "Navigasi Halaman": "Bantu saya menemukan halaman pengajuan proposal.",
    "Arahkan ke IT": "Saya membutuhkan bantuan IT untuk akses sistem.",
  };
  promptValue.value = prompts[action] ?? action;
}

function handleComposerKey(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
}

function handleFile(file: File | undefined, kind: "attachment" | "dataset") {
  void selectAnalysisFile(file, kind);
}

async function loadHistory(session: ChatSession) {
  if (!user.value || loading.value || requestController) {
    notify("Tunggu jawaban AI selesai sebelum membuka riwayat lain");
    return;
  }
  activeView.value = "Chat";
  dialog.value = null;
  sidebarOpen.value = false;
  promptValue.value = "";
  clearAttachment();
  messages.value = [];
  currentSessionId.value = session.id;
  copilot.value = session.copilot;
  mood.value = session.mood;
  loading.value = true;
  try {
    messages.value = await loadChatSession(user.value.uid, session.id);
  } catch {
    currentSessionId.value = null;
    notify("Sesi belum dapat dibuka");
  } finally {
    loading.value = false;
  }
}

function newChat() {
  if (loading.value || requestController) {
    notify("Tunggu jawaban AI selesai sebelum membuat chat baru");
    return;
  }
  activeView.value = "Chat";
  promptValue.value = "";
  clearAttachment();
  messages.value = [];
  currentSessionId.value = null;
  sidebarOpen.value = false;
}

async function removeSession(session: ChatSession) {
  if (!user.value || loading.value || requestController) return;
  if (!window.confirm(`Hapus sesi “${session.title}”? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await deleteChatSession(user.value.uid, session.id);
    if (currentSessionId.value === session.id) newChat();
    notify("Sesi berhasil dihapus");
  } catch {
    notify("Sesi belum berhasil dihapus");
  }
}

function selectView(view: string) {
  activeView.value = view;
  sidebarOpen.value = false;
}

function openModule(title: string) {
  const mapping: Record<string, string> = { "Proposal Kredit": "Chat", "Dashboard Risiko": "Analisa Data", "Pusat Bantuan IT": "Arahkan ke IT" };
  activeView.value = mapping[title] ?? title;
  if (title === "Proposal Kredit") promptValue.value = "Tampilkan status proposal kredit dan risiko yang perlu ditindaklanjuti.";
}

function downloadSummary() {
  const url = URL.createObjectURL(new Blob([summaryText.value], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ringkasan-sw1h.txt";
  link.click();
  URL.revokeObjectURL(url);
  notify("Ringkasan berhasil diunduh");
}

async function copySummary() {
  await navigator.clipboard?.writeText(summaryText.value);
  notify("Ringkasan SW1H disalin");
}

function chooseDataset(file: File | undefined) {
  void selectAnalysisFile(file, "dataset");
}

function ensureTicketNumber() {
  if (!ticketNumber.value) {
    ticketNumber.value = `IT-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return ticketNumber.value;
}

function submitTicket() {
  if (!ticketDescription.value.trim()) {
    notify("Tuliskan detail kendala terlebih dahulu");
    return;
  }
  ensureTicketNumber();
  notify("Tiket IT berhasil dibuat");
}

function emailTicket() {
  if (!ticketDescription.value.trim()) {
    notify("Tuliskan detail kendala terlebih dahulu");
    return;
  }
  const ticket = ensureTicketNumber();
  const supportEmail = import.meta.env.VITE_IT_SUPPORT_EMAIL?.trim() ?? "";
  const userEmail = profile.value?.email?.trim() ?? "";
  const recipient = supportEmail || userEmail;
  if (!recipient) {
    notify("Alamat email tujuan tidak tersedia");
    return;
  }
  const ccEmail = supportEmail && userEmail && userEmail !== supportEmail ? userEmail : "";
  const subject = `[Tiket IT ${ticket}] ${ticketCategory.value} - ${ticketPriority.value}`;
  const body = [
    `Nama pelapor: ${profile.value?.displayName ?? "-"}`,
    `Email pelapor: ${userEmail || "-"}`,
    `Kategori: ${ticketCategory.value}`,
    `Prioritas: ${ticketPriority.value}`,
    `Nomor tiket: ${ticket}`,
    "",
    "Detail kendala:",
    ticketDescription.value.trim(),
  ].join("\n");
  const params = new URLSearchParams();
  if (ccEmail) params.set("cc", ccEmail);
  params.set("subject", subject);
  params.set("body", body);
  const query = params.toString().replace(/\+/g, "%20");
  window.location.href = `mailto:${recipient}?${query}`;
  notify(supportEmail ? "Membuka email untuk tim IT" : "Membuka email tiket IT");
}

watch([() => messages.value.length, loading], async () => {
  await nextTick();
  chatEnd.value?.scrollIntoView({ behavior: "smooth", block: "end" });
});

onMounted(() => {
  if (!isFirebaseConfigured) return;
  const { auth } = getFirebaseServices();
  unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
    user.value = nextUser;
    authReady.value = true;
    stopDataSubscriptions();
    sessions.value = [];
    memories.value = [];
    messages.value = [];
    currentSessionId.value = null;
    clearAttachment();
    if (nextUser) void loadProfile(nextUser);
    else profile.value = null;
  });
});

onBeforeUnmount(() => {
  requestController?.abort();
  unsubscribeAuth?.();
  stopDataSubscriptions();
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <main v-if="!authReady" class="loading-screen"><span></span></main>

  <main v-else-if="!user" class="auth-page">
    <div class="auth-glow auth-glow-one"></div><div class="auth-glow auth-glow-two"></div>
    <section class="auth-shell">
      <aside class="auth-visual">
        <span class="auth-brand"><img src="/sum-ai-mascot.png" alt="SUMA-AI"></span>
        <p class="auth-kicker">SUMA-AI Copilot</p>
        <h1>Selesaikan pekerjaan lebih cepat bersama SUMA-AI.</h1>
        <p>Dapatkan bantuan analisis data, penyusunan ringkasan, navigasi pekerjaan, dan dukungan awal IT dalam satu asisten.</p>
        <div class="auth-benefits"><span>✓ Analisis data dan risiko lebih terarah</span><span>✓ Ringkasan SW1H tersusun cepat</span><span>✓ Navigasi kerja dan bantuan IT</span></div>
      </aside>
      <div class="auth-card">
        <header><span>{{ authMode === 'login' ? 'Selamat datang kembali' : 'Buat akun baru' }}</span><h2>{{ authMode === 'login' ? 'Masuk ke workspace' : 'Daftar SUMA-AI' }}</h2><p>{{ authMode === 'login' ? 'Gunakan akun yang sudah terdaftar.' : 'Mulai dengan email dan kata sandi.' }}</p></header>
        <div v-if="!isFirebaseConfigured" class="auth-config-error"><strong>Firebase belum dikonfigurasi</strong><p>Isi variabel berikut di <code>.env.local</code>:</p><ul><li v-for="item in missingFirebaseConfig" :key="item"><code>{{ item }}</code></li></ul></div>
        <form v-else @submit.prevent="submitAuth">
          <label v-if="authMode === 'register'">Nama lengkap<input v-model="authName" autocomplete="name" placeholder="Nama Anda" required></label>
          <label>Email<input v-model="authEmail" type="email" autocomplete="email" placeholder="nama@perusahaan.com" required></label>
          <label>Kata sandi<input v-model="authPassword" type="password" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'" minlength="8" placeholder="Minimal 8 karakter" required></label>
          <label v-if="authMode === 'register'">Ulangi kata sandi<input v-model="authConfirmation" type="password" autocomplete="new-password" minlength="8" placeholder="Ketik ulang kata sandi" required></label>
          <button v-if="authMode === 'login'" type="button" class="forgot-password" :disabled="authBusy" @click="resetPassword">Lupa kata sandi?</button>
          <p v-if="authError" class="auth-message error" role="alert">{{ authError }}</p>
          <p v-if="authNotice" class="auth-message success" role="status">{{ authNotice }}</p>
          <button class="auth-submit" type="submit" :disabled="authBusy">{{ authBusy ? 'Memproses...' : authMode === 'login' ? 'Masuk' : 'Buat akun' }}</button>
        </form>
        <footer><span>{{ authMode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?' }}</span><button type="button" @click="changeAuthMode(authMode === 'login' ? 'register' : 'login')">{{ authMode === 'login' ? 'Daftar sekarang' : 'Masuk' }}</button></footer>
      </div>
    </section>
  </main>

  <main v-else-if="profileError" class="profile-error-screen"><section><UiIcon name="database" :size="30"/><h1>Profil Firebase belum dapat dimuat</h1><p>{{ profileError }}</p><button type="button" @click="logout">Kembali ke halaman masuk</button></section></main>
  <main v-else-if="!profile" class="loading-screen"><span></span></main>

  <main v-else-if="!profile.onboarded" class="picker-page">
    <div class="ambient-backdrop ambient-picker" aria-hidden="true"><span class="ambient-aurora aurora-one"></span><span class="ambient-aurora aurora-two"></span><span class="ambient-mesh"></span></div>
    <header class="picker-header"><div class="step-label"><span>1</span>Pilih Copilot</div></header>
    <section class="picker-content">
      <h1>Pilih <span>Copilot-mu</span></h1><p class="picker-subtitle">Pilih gaya asisten yang paling sesuai. Kamu dapat menggantinya kapan saja.</p>
      <div class="copilot-grid" role="radiogroup">
        <article v-for="(item, id) in copilotData" :key="id" :class="['copilot-card', item.accent, { selected: selectedCopilot === id }]" role="radio" :aria-checked="selectedCopilot === id" tabindex="0" @click="selectedCopilot = id" @keydown.enter="selectedCopilot = id">
          <span v-if="selectedCopilot === id" class="popular-pill"><UiIcon name="sparkle" :size="12"/> Terpilih</span><span class="radio-dot"><span></span></span>
          <span class="copilot-visual" :data-copilot="id"><img :src="item.image" alt=""></span>
          <span class="copilot-info"><strong class="copilot-name">{{ item.name }}</strong><span class="copilot-role">{{ item.role }}</span><span class="tag-row"><span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span></span><span class="benefit-list"><span v-for="benefit in item.benefits" :key="benefit"><i><UiIcon name="check" :size="11"/></i>{{ benefit }}</span></span><button class="card-cta" type="button" @click.stop="continueToWorkspace">Pilih {{ item.name }} <UiIcon name="arrow" :size="15"/></button></span>
        </article>
      </div>
      <button type="button" :class="['memory-consent', { active: onboardingMemory }]" :aria-pressed="onboardingMemory" @click="onboardingMemory = !onboardingMemory"><span><UiIcon name="shield" :size="17"/></span><span><strong>Memori personal otomatis aktif</strong><small>Fakta personal umum dapat langsung disimpan dan dikirim sebagai konteks ke n8n/AI. Klik untuk menonaktifkan; jangan masukkan data rahasia.</small></span><i><b></b></i></button>
      <button class="mobile-continue" :disabled="onboardingBusy" @click="continueToWorkspace">{{ onboardingBusy ? 'Menyimpan...' : `Lanjut dengan ${copilotData[selectedCopilot].name}` }} <UiIcon name="arrow" :size="16"/></button>
    </section>
  </main>

  <main v-else class="workspace-page">
    <div class="ambient-backdrop ambient-workspace" aria-hidden="true"><span class="ambient-aurora aurora-one"></span><span class="ambient-aurora aurora-two"></span><span class="ambient-mesh"></span></div>
    <div :class="['sidebar-backdrop', { show: sidebarOpen }]" @click="sidebarOpen = false"></div>
    <aside :class="['sidebar', { open: sidebarOpen }]">
      <div class="sidebar-mobile-head"><span>Workspace SUMA-AI</span><button type="button" @click="sidebarOpen = false"><UiIcon name="close"/></button></div>
      <nav class="main-nav" aria-label="Navigasi utama"><button v-for="[icon, label] in navItems" :key="label" type="button" :class="{ active: activeView === label }" @click="selectView(label)"><UiIcon :name="icon" :size="17"/><span>{{ label }}</span></button></nav>
      <div class="sidebar-divider"></div>
      <section class="history-section">
        <div class="history-title"><span>Riwayat Chat</span><button type="button" @click="openDialog('history')"><UiIcon name="search" :size="16"/></button></div>
        <button type="button" class="new-chat-button" @click="newChat"><UiIcon name="plus" :size="15"/> Chat baru</button>
        <div class="history-list"><div v-for="session in sessions.slice(0, 6)" :key="session.id" :class="['history-row', { active: currentSessionId === session.id && activeView === 'Chat' }]"><button type="button" class="history-open" :title="session.title" @click="loadHistory(session)"><span>{{ session.title }}</span><time>{{ formatSessionTime(session.updatedAtMs) }}</time></button><button type="button" class="history-delete" :aria-label="`Hapus ${session.title}`" @click="removeSession(session)"><UiIcon name="trash" :size="13"/></button></div><p v-if="sessions.length === 0" class="history-empty">Belum ada percakapan tersimpan.</p></div>
        <button v-if="sessions.length" type="button" class="see-all" @click="openDialog('history')">Lihat semua</button>
      </section>
      <button type="button" class="switch-copilot" @click="openDialog('switch')"><UiIcon name="refresh" :size="18"/> Ganti copilot</button>
    </aside>

    <div class="workspace-main">
      <header class="workspace-header">
        <div class="header-identity"><button class="mobile-menu" type="button" @click="sidebarOpen = true"><UiIcon name="menu"/></button><button type="button" class="brand-home-button" @click="activeView = 'Beranda'"><span class="brand-mark small" :data-copilot="copilot"><img :src="activeCopilot.image" alt=""></span><strong>{{ activeCopilot.name }}</strong></button><span class="online-dot"></span><small>Online</small></div>
        <div class="header-actions"><button class="activity-button" type="button" @click="notify('Seluruh data tersinkron dengan Firebase')"><UiIcon name="activity" :size="16"/><span>Aktivitas</span></button><div class="popover-wrap"><button class="profile-button" type="button" :aria-expanded="profileOpen" @click="profileOpen = !profileOpen"><span>{{ initials }}</span><UiIcon name="chevron" :size="14"/></button><div v-if="profileOpen" class="header-popover profile-popover"><strong>{{ profile.displayName }}</strong><small>{{ profile.role }} · {{ profile.email }}</small><button type="button" @click="openDialog('memory')">Memori personal <span>{{ memories.length }}</span></button><button type="button" @click="openDialog('settings')">Pengaturan profil</button><button type="button" @click="openDialog('logout')">Keluar</button></div></div></div>
      </header>

      <template v-if="activeView === 'Chat'">
        <div :class="['chat-content', { 'has-result': messages.length }]">
          <section v-if="messages.length === 0 && !loading" class="empty-chat"><div class="orbit-art"><i></i><i></i><i></i><span class="orbit-one"></span><span class="orbit-two"></span></div><div class="hero-mascot"><span class="brand-mark large"><img :src="activeCopilot.image" alt=""></span></div><div class="welcome-copy"><div class="assistant-label"><span class="brand-mark small"><img :src="activeCopilot.image" alt=""></span><strong>{{ activeCopilot.name }}</strong><time>Siap</time></div><h2>Apa yang ingin kamu selesaikan hari ini?</h2><div class="quick-actions"><button v-for="[icon, label] in quickActions" :key="label" type="button" @click="quickAction(label)"><span><UiIcon :name="icon" :size="15"/></span>{{ label }}</button></div></div></section>
          <section v-else class="analysis-view conversation-view" aria-live="polite">
            <template v-for="message in messages" :key="message.id"><div v-if="message.role === 'user'" class="user-bubble chat-bubble"><span>{{ message.content }}</span><time>{{ message.time }}</time></div><article v-else :class="['assistant-response', 'ai-message', { 'scope-refusal': message.inScope === false, 'ai-error': message.error }]"><div class="assistant-label"><span class="brand-mark small"><img :src="activeCopilot.image" alt=""></span><strong>{{ activeCopilot.name }}</strong><time>{{ message.time }}</time></div><span v-if="message.inScope === false" class="scope-badge"><UiIcon name="shield" :size="13"/> Di luar konteks</span><div class="ai-answer">{{ message.content }}</div><div v-if="!message.error && message.inScope !== false" class="ai-disclaimer"><UiIcon name="sparkle" :size="12"/> Jawaban dibuat AI. Jangan kirim data sensitif; verifikasi angka penting.</div></article></template>
            <article v-if="loading" class="assistant-response ai-message ai-loading"><div class="assistant-label"><span class="brand-mark small"><img :src="activeCopilot.image" alt=""></span><strong>{{ activeCopilot.name }}</strong><span class="live-dot"></span> Memproses</div><div class="typing-indicator"><i></i><i></i><i></i></div><p>Memahami konteks dan menyusun jawaban...</p></article><div ref="chatEnd"></div>
          </section>
        </div>
        <div :class="['composer-shell', { compact: messages.length }]">
          <div class="suggestion-row"><button v-for="suggestion in suggestionSets[suggestionIndex]" :key="suggestion" type="button" @click="promptValue = suggestion">{{ suggestion }}</button><button type="button" class="suggestion-refresh" @click="suggestionIndex = (suggestionIndex + 1) % suggestionSets.length"><UiIcon name="refresh" :size="14"/></button></div>
          <div class="composer">
            <div v-if="attachmentBusy" class="attachment-chip attachment-loading">
              <UiIcon name="refresh" :size="13"/>
              <span>Membaca file...</span>
            </div>
            <div v-else-if="selectedAttachment" class="attachment-chip">
              <UiIcon name="paperclip" :size="13"/>
              <span><strong>{{ attachmentName }}</strong><small>{{ attachmentMeta }}</small></span>
              <button type="button" aria-label="Hapus lampiran" @click="clearAttachment"><UiIcon name="close" :size="12"/></button>
            </div>
            <textarea
              v-model="promptValue"
              rows="1"
              :disabled="loading || attachmentBusy"
              :placeholder="loading ? 'Tunggu jawaban AI...' : attachmentBusy ? 'Membaca file...' : `Tanyakan pekerjaan kepada ${activeCopilot.name}...`"
              @keydown="handleComposerKey"
            ></textarea>
            <div class="composer-tools">
              <div class="left-tools">
                <button type="button" :disabled="loading || attachmentBusy" title="Lampirkan file" @click="fileInput?.click()"><UiIcon name="paperclip"/></button>
                <button type="button" @click="promptValue += `${promptValue ? '\n\n' : ''}| Indikator | Nilai | Catatan |\n|---|---:|---|\n| Contoh | 0 | Isi |`"><UiIcon name="table"/></button>
                <button type="button" :disabled="loading || attachmentBusy" title="Pilih data" @click="datasetInput?.click()"><UiIcon name="cloud"/></button>
              </div>
              <div class="right-tools">
                <button type="button" class="voice-button" @click="promptValue = 'Tolong rangkum hasil analisis dan berikan rekomendasi tindak lanjut.'"><UiIcon name="voice" :size="21"/></button>
                <button type="button" class="send-button" :disabled="loading || attachmentBusy || (!promptValue.trim() && !selectedAttachment)" @click="sendPrompt">
                  <UiIcon :name="loading ? 'refresh' : 'send'" :size="16"/>
                  <span>{{ loading ? 'Proses' : 'Kirim' }}</span>
                </button>
              </div>
            </div>
            <input ref="fileInput" class="visually-hidden" type="file" :accept="ANALYSIS_FILE_ACCEPT" @change="handleFile(($event.target as HTMLInputElement).files?.[0], 'attachment')">
            <input ref="datasetInput" class="visually-hidden" type="file" accept=".xlsx,.csv,.tsv,.json" @change="handleFile(($event.target as HTMLInputElement).files?.[0], 'dataset')">
          </div>
          <p class="composer-hint">PDF, DOCX, XLSX, CSV, teks, JSON, dan gambar <i></i> Enter untuk kirim</p>
        </div>
      </template>

      <div v-else class="view-scroll">
        <section v-if="activeView === 'Beranda'" class="page-view"><div class="section-heading"><div><span class="view-kicker">Workspace personal</span><h1>Selamat datang, {{ profile.displayName }}</h1><p>Sesi dan memori akunmu tersinkron melalui Firebase.</p></div><button class="view-primary" type="button" @click="newChat"><UiIcon name="plus"/> Chat baru</button></div><div class="metric-grid"><article><span class="metric-icon"><UiIcon name="chat"/></span><small>Sesi tersimpan</small><strong>{{ sessions.length }}</strong></article><article><span class="metric-icon"><UiIcon name="database"/></span><small>Memori personal</small><strong>{{ memories.length }}</strong></article><article><span class="metric-icon"><UiIcon name="shield"/></span><small>Personalisasi</small><strong>{{ profile.memoryEnabled ? 'Aktif' : 'Nonaktif' }}</strong></article></div><div class="recent-panel"><div class="panel-title"><div><span>Percakapan terbaru</span><small>Khusus akun {{ profile.email }}</small></div></div><div class="history-dialog-list"><div v-for="session in sessions.slice(0, 5)" :key="session.id" class="history-dialog-row"><button type="button" class="history-dialog-open" @click="loadHistory(session)"><span><UiIcon name="chat"/><span><strong>{{ session.title }}</strong><small>{{ session.messageCount }} pesan</small></span></span><time>{{ formatSessionTime(session.updatedAtMs) }}</time><UiIcon name="arrow" :size="15"/></button></div><p v-if="sessions.length === 0" class="history-dialog-empty">Belum ada sesi. Mulai chat pertama sekarang.</p></div></div></section>

        <section v-else-if="activeView === 'Analisa Data'" class="page-view">
          <div class="section-heading">
            <div><span class="view-kicker">Workbench data</span><h1>Analisa Data</h1><p>Pilih file lalu kirim instruksi analisis ke SUMA-AI.</p></div>
          </div>
          <div class="data-workbench">
            <div class="upload-zone">
              <span class="upload-icon"><UiIcon :name="attachmentBusy ? 'refresh' : 'cloud'" :size="25"/></span>
              <h2>{{ attachmentBusy ? "Membaca file..." : "Pilih data untuk dianalisis" }}</h2>
              <p>XLSX, CSV, TSV, dan JSON. Maksimal 10 MB.</p>
              <button type="button" class="view-primary" :disabled="attachmentBusy || loading" @click="datasetInput?.click()">
                {{ selectedAttachment ? "Ganti file" : "Pilih file data" }}
              </button>
            </div>
            <div :class="['dataset-preview', { empty: !selectedAttachment }]">
              <template v-if="selectedAttachment">
                <div class="dataset-head">
                  <div>
                    <span><UiIcon name="table"/></span>
                    <div><strong>{{ datasetName }}</strong><small>{{ attachmentMeta }}</small></div>
                  </div>
                  <b :class="{ warning: selectedAttachment.truncated }">{{ selectedAttachment.truncated ? "Sebagian" : "Valid" }}</b>
                </div>
                <button
                  type="button"
                  class="analyze-now"
                  :disabled="attachmentBusy || loading"
                  @click="runAnalysis(`Analisis dataset ${datasetName}: tampilkan tren, anomali, kelayakan, dan risiko utama.`, messages, selectedAttachment)"
                >
                  <UiIcon name="sparkle"/> Analisis dengan SUMA-AI <UiIcon name="arrow"/>
                </button>
              </template>
              <div v-else class="dataset-empty">
                <UiIcon name="table" :size="28"/>
                <strong>Belum ada file</strong>
                <small>Pratinjau metadata tampil setelah file berhasil dibaca.</small>
              </div>
            </div>
          </div>
          <input ref="datasetInput" class="visually-hidden" type="file" accept=".xlsx,.csv,.tsv,.json" @change="chooseDataset(($event.target as HTMLInputElement).files?.[0])">
        </section>

        <section v-else-if="activeView === 'Ringkasan SW1H'" class="page-view"><div class="section-heading"><div><span class="view-kicker">Dokumen terstruktur</span><h1>Ringkasan SW1H</h1><p>Enam pertanyaan kunci dalam sekali lihat.</p></div><div class="heading-actions"><button type="button" class="view-secondary" @click="copySummary"><UiIcon name="copy"/> Salin</button><button type="button" class="view-primary" @click="downloadSummary"><UiIcon name="download"/> Unduh</button></div></div><div class="sw1h-grid"><article v-for="([english, label, text], index) in sw1hItems" :key="english"><span>{{ index + 1 }}</span><div><small>{{ english }}</small><h2>{{ label }}</h2><p>{{ text }}</p></div></article></div><div class="insight-note"><span><UiIcon name="sparkle"/></span><div><strong>Butuh versi sesuai data asli?</strong><p>Minta SUMA-AI membuat SW1H berdasarkan sesi atau dataset Anda.</p></div><button type="button" @click="activeView = 'Chat'; promptValue = 'Buatkan ringkasan SW1H berdasarkan percakapan dan data terbaru.'">Tanyakan <UiIcon name="arrow" :size="14"/></button></div></section>

        <section v-else-if="activeView === 'Navigasi Halaman'" class="page-view"><div class="section-heading"><div><span class="view-kicker">Temukan lebih cepat</span><h1>Navigasi Halaman</h1><p>Cari modul atau bantuan yang kamu butuhkan.</p></div></div><label class="module-search"><UiIcon name="search"/><input v-model="moduleSearch" placeholder="Cari halaman atau fitur..."></label><div class="module-grid"><article v-for="[icon, title, copy] in filteredModules" :key="title"><span><UiIcon :name="icon" :size="20"/></span><div><h2>{{ title }}</h2><p>{{ copy }}</p></div><button type="button" @click="openModule(title)"><UiIcon name="arrow"/></button></article></div><div v-if="filteredModules.length === 0" class="empty-search"><UiIcon name="search" :size="28"/><h2>Halaman tidak ditemukan</h2><button type="button" @click="moduleSearch = ''">Hapus pencarian</button></div></section>

        <section v-else class="page-view"><div class="section-heading"><div><span class="view-kicker">Dukungan internal</span><h1>Arahkan ke IT</h1><p>Jelaskan kendala agar informasinya siap ditindaklanjuti.</p></div><span class="service-status"><i></i> Semua sistem normal</span></div><div class="support-layout"><form class="ticket-form" @submit.prevent="submitTicket"><div class="panel-title"><div><span>Buat tiket bantuan</span><small>Data tiket demo tersimpan selama halaman aktif</small></div></div><label>Kategori<select v-model="ticketCategory"><option>Akses akun</option><option>Gangguan aplikasi</option><option>Permintaan data</option><option>Perangkat kerja</option></select></label><label>Prioritas<select v-model="ticketPriority"><option>Normal</option><option>Tinggi</option><option>Kritis</option></select></label><label class="full-field">Detail kendala<textarea v-model="ticketDescription" rows="5" placeholder="Contoh: Saya tidak bisa membuka halaman proposal..."></textarea></label><div class="ticket-actions"><button type="button" class="view-secondary" @click="activeView = 'Chat'; promptValue = `Bantu diagnosa masalah IT: ${ticketDescription || 'tidak bisa mengakses sistem'}.`"><UiIcon name="chat"/> Chat dengan AI</button><button type="button" class="view-secondary" @click="emailTicket"><UiIcon name="mail"/> Kirim ke email</button><button type="submit" class="view-primary"><UiIcon name="send"/> Kirim tiket</button></div></form><aside class="support-side"><div v-if="ticketNumber" class="ticket-success"><span><UiIcon name="check" :size="22"/></span><small>Tiket berhasil dibuat</small><strong>{{ ticketNumber }}</strong><p>{{ ticketCategory }} · {{ ticketPriority }}</p></div><div v-else class="support-card"><span class="brand-mark large"><img src="/d4shgrd-mascot.png" alt=""></span><h2>Butuh jawaban cepat?</h2><p>D4SHGRD dapat membantu pengecekan awal.</p></div></aside></div></section>
      </div>
    </div>

    <div v-if="dialog" class="modal-overlay info-overlay" @mousedown.self="dialog = null">
      <section class="info-modal" role="dialog" aria-modal="true">
        <header><div><h2>{{ dialog === 'memory' ? 'Memori Personal' : dialog === 'settings' ? 'Pengaturan Profil' : dialog === 'history' ? 'Semua Riwayat Chat' : dialog === 'switch' ? 'Ganti Copilot' : 'Keluar dari workspace?' }}</h2><p>{{ dialog === 'memory' ? 'Tersimpan terpisah untuk akun Firebase ini.' : dialog === 'history' ? 'Cari, buka, atau hapus percakapan akun ini.' : dialog === 'logout' ? 'Sesi dan memori tetap tersimpan setelah keluar.' : 'Perubahan akan disimpan ke profil Firebase.' }}</p></div><button type="button" @click="dialog = null"><UiIcon name="close" :size="20"/></button></header>
        <div class="info-modal-body">
          <div v-if="dialog === 'memory'" class="memory-manager"><div class="memory-toggle-row"><span><strong>Gunakan memori untuk personalisasi</strong><small>{{ profile.memoryEnabled ? 'Aktif - memori dikirim sebagai konteks ke n8n/AI.' : 'Nonaktif - data lama tetap tersimpan tetapi tidak digunakan.' }}</small></span><button type="button" :class="{ active: profile.memoryEnabled }" @click="toggleMemory"><i></i>{{ profile.memoryEnabled ? 'Aktif' : 'Nonaktif' }}</button></div><div class="memory-warning"><UiIcon name="shield" :size="17"/><p>Jangan simpan password, PIN, OTP, token, API key, NIK, rekening, atau data kartu.</p></div><form class="memory-form" @submit.prevent="addManualMemory"><label>Label<input v-model="memoryLabel" maxlength="80" placeholder="Contoh: Nama panggilan" required></label><label>Informasi<textarea v-model="memoryValue" maxlength="1000" rows="3" placeholder="Contoh: Panggil saya Budi" required></textarea></label><button type="submit" :disabled="memoryBusy || !memoryLabel.trim() || !memoryValue.trim()"><UiIcon name="plus" :size="14"/>{{ memoryBusy ? 'Menyimpan...' : 'Tambah memori' }}</button></form><div class="memory-list"><div class="memory-list-title"><strong>Memori tersimpan</strong><span>{{ memories.length }}/{{ PERSONAL_MEMORY_LIMIT }}</span></div><article v-for="memory in memories" :key="memory.key"><span><small>{{ memory.label }}</small><strong>{{ memory.value }}</strong></span><button type="button" @click="removeMemory(memory)"><UiIcon name="trash" :size="14"/></button></article><div v-if="memories.length === 0" class="memory-empty"><UiIcon name="database" :size="24"/><p>Belum ada memori personal.</p><small>Tulis “ingat bahwa nama saya ...” di chat.</small></div></div></div>
          <div v-else-if="dialog === 'settings'" class="settings-form"><label>Nama lengkap<input v-model="settingsName"></label><label>Peran<input v-model="settingsRole"></label><label>Email akun<input :value="profile.email" disabled></label></div>
          <div v-else-if="dialog === 'history'"><label class="history-search"><UiIcon name="search"/><input v-model="historySearch" autofocus placeholder="Cari riwayat..."></label><div class="history-dialog-list"><div v-for="session in filteredSessions" :key="session.id" class="history-dialog-row"><button type="button" class="history-dialog-open" @click="loadHistory(session)"><span><UiIcon name="chat"/><span><strong>{{ session.title }}</strong><small>{{ session.messageCount }} pesan · {{ copilotData[session.copilot].name }}</small></span></span><time>{{ formatSessionTime(session.updatedAtMs) }}</time><UiIcon name="arrow" :size="15"/></button><button type="button" class="history-dialog-delete" @click="removeSession(session)"><UiIcon name="trash" :size="15"/></button></div><p v-if="filteredSessions.length === 0" class="history-dialog-empty">Tidak ada sesi yang cocok.</p></div></div>
          <div v-else-if="dialog === 'switch'"><div class="compact-cards"><button v-for="(item, id) in copilotData" :key="id" type="button" :class="['copilot-card', item.accent, 'compact', { selected: switchCopilot === id }]" @click="switchCopilot = id"><span class="copilot-visual"><img :src="item.image" alt=""></span><span class="copilot-info"><strong>{{ item.name }}</strong><small>{{ item.role }}</small></span></button></div><div class="mood-row"><span>Mood respons</span><div><button v-for="item in (['Baik', 'Fokus', 'Santai', 'Galak'] as UserMood[])" :key="item" type="button" :class="{ active: switchMood === item }" @click="switchMood = item">{{ item }}</button></div></div></div>
          <div v-else class="logout-copy"><span><UiIcon name="shield" :size="22"/></span><p>Sesi chat dan memori personal tetap tersimpan pada akun ini. Keluar tidak akan menghapus data.</p></div>
        </div>
        <footer><button type="button" class="dialog-secondary" @click="dialog = null">Batal</button><button v-if="dialog === 'memory' && memories.length" type="button" class="dialog-danger" @click="removeAllMemories">Hapus semua</button><button v-else-if="dialog === 'settings'" type="button" class="dialog-primary" @click="saveSettings">Simpan</button><button v-else-if="dialog === 'switch'" type="button" class="dialog-primary" @click="applyCopilot">Terapkan</button><button v-else-if="dialog === 'logout'" type="button" class="dialog-danger" @click="logout">Keluar</button></footer>
      </section>
    </div>
    <div v-if="toast" class="app-toast" role="status"><span><UiIcon name="check" :size="14"/></span>{{ toast }}</div>
  </main>
</template>
