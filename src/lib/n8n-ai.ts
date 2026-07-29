"use client";

import { isClearlyOutOfScope, SCOPE_REFUSAL } from "./ai-scope.ts";
import {
  MAX_EXTRACTED_TEXT_CHARACTERS,
  MAX_INLINE_FILE_BYTES,
} from "./file-analysis.ts";
import type { AnalysisAttachment } from "./file-analysis.ts";

export type ScopedChatHistory = {
  role: "user" | "assistant";
  content: string;
};

export type ScopedChatRequest = {
  message: string;
  history: ScopedChatHistory[];
  copilot: "sum-ai" | "d4shgrd";
  mood: "Baik" | "Fokus" | "Santai" | "Galak";
  attachment?: AnalysisAttachment;
};

export type ScopedChatResponse = {
  answer: string;
  inScope: boolean;
};

type N8nErrorBody = {
  error?: unknown;
  message?: unknown;
};

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_MESSAGES = 10;
const REQUEST_TIMEOUT_MS = 120_000;
const INLINE_MEDIA_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const LOCAL_N8N_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function normalizeHistory(history: ScopedChatHistory[]): ScopedChatHistory[] {
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .flatMap((item) => {
      const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
      const content = typeof item.content === "string"
        ? item.content.normalize("NFKC").trim().slice(0, MAX_MESSAGE_LENGTH)
        : "";
      return role && content ? [{ role, content }] : [];
    });
}

export function normalizeN8nResponse(data: unknown): ScopedChatResponse {
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as Partial<ScopedChatResponse>).answer !== "string" ||
    typeof (data as Partial<ScopedChatResponse>).inScope !== "boolean"
  ) {
    throw new Error("Format respons workflow n8n tidak valid.");
  }

  const parsed = data as ScopedChatResponse;
  if (!parsed.answer.trim()) throw new Error("AI tidak mengirim jawaban.");

  return parsed.inScope
    ? { inScope: true, answer: parsed.answer.trim() }
    : { inScope: false, answer: SCOPE_REFUSAL };
}

export function normalizeWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("URL webhook n8n tidak valid.");
  }

  const isLocalHttp = url.protocol === "http:" && LOCAL_N8N_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Webhook n8n harus menggunakan HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Jangan menaruh credential di URL webhook n8n.");
  }
  if (!/^\/webhook(?:-test)?\/[^/]+\/?$/.test(url.pathname)) {
    if (url.pathname.startsWith("/workflow/")) {
      throw new Error(
        "Gunakan Production URL dari node Webhook (/webhook/...), bukan URL editor workflow (/workflow/...).",
      );
    }
    throw new Error("Path webhook n8n tidak valid. Gunakan URL /webhook/... atau /webhook-test/....");
  }

  url.hash = "";
  return url.toString();
}

export function normalizeAttachment(
  attachment: AnalysisAttachment | undefined,
): AnalysisAttachment | undefined {
  if (!attachment) return undefined;
  const name = attachment.name.normalize("NFKC").trim().slice(0, 180);
  if (!name || attachment.size <= 0 || !Number.isSafeInteger(attachment.size)) {
    throw new Error("Metadata file tidak valid.");
  }

  if (attachment.mode === "inline") {
    if (!INLINE_MEDIA_TYPES.has(attachment.mediaType)) {
      throw new Error("Tipe file multimodal tidak didukung.");
    }
    if (attachment.size > MAX_INLINE_FILE_BYTES) {
      throw new Error("File PDF atau gambar melewati batas ukuran.");
    }
    const expectedLength = Math.ceil(attachment.size / 3) * 4;
    if (
      !attachment.data ||
      attachment.data.length !== expectedLength ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.data)
    ) {
      throw new Error("Data file multimodal tidak valid.");
    }
    return { ...attachment, name };
  }

  const text = attachment.text.normalize("NFKC").trim();
  if (!text || text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new Error("Teks hasil ekstraksi file tidak valid atau terlalu panjang.");
  }
  return {
    ...attachment,
    name,
    text,
    summary: attachment.summary.normalize("NFKC").trim().slice(0, 300),
  };
}

function getConfiguration() {
  const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env ?? {};
  const configuredWebhookUrl = env.VITE_N8N_WEBHOOK_URL?.trim();
  const companyId = env.VITE_SUMAI_COMPANY_ID?.trim();

  if (!configuredWebhookUrl) {
    throw new Error("URL webhook n8n belum diatur. Isi VITE_N8N_WEBHOOK_URL sebelum build.");
  }
  if (!companyId) {
    throw new Error("ID perusahaan belum diatur. Isi VITE_SUMAI_COMPANY_ID sebelum build.");
  }

  const webhookUrl = normalizeWebhookUrl(configuredWebhookUrl);
  return { webhookUrl, companyId };
}

function errorMessage(status: number, body: N8nErrorBody | null): string {
  const detail = typeof body?.error === "string"
    ? body.error
    : typeof body?.message === "string"
      ? body.message
      : "";
  if (detail) return detail;
  if (status === 400) return "Permintaan ke workflow n8n tidak valid.";
  if (status === 401 || status === 403) return "Akses ke workflow n8n ditolak.";
  if (status === 404) return "Data perusahaan tidak ditemukan di Google Sheets.";
  if (status === 429) return "Layanan AI sedang terlalu sibuk. Coba beberapa saat lagi.";
  if (status >= 500) return "Layanan AI atau workflow n8n sedang tidak tersedia.";
  return `Workflow n8n mengembalikan HTTP ${status}.`;
}

export async function sendScopedChat(
  request: ScopedChatRequest,
  externalSignal?: AbortSignal,
): Promise<ScopedChatResponse> {
  const message = request.message.normalize("NFKC").trim();
  if (!message) throw new Error("Pesan tidak boleh kosong.");
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Pesan maksimal ${MAX_MESSAGE_LENGTH.toLocaleString("id-ID")} karakter.`);
  }
  if (isClearlyOutOfScope(message)) {
    return { inScope: false, answer: SCOPE_REFUSAL };
  }
  const attachment = normalizeAttachment(request.attachment);

  const { webhookUrl, companyId } = getConfiguration();
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        // text/plain menjaga request tetap sederhana sehingga browser tidak
        // perlu melakukan preflight CORS. Node validasi n8n mem-parsing JSON-nya.
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify({
        schemaVersion: "1.0",
        requestId: globalThis.crypto?.randomUUID?.() ?? `sumai-${Date.now()}`,
        companyId,
        message,
        history: normalizeHistory(request.history),
        copilot: request.copilot === "d4shgrd" ? "d4shgrd" : "sum-ai",
        mood: request.mood,
        locale: "id-ID",
        ...(attachment ? { attachment } : {}),
      }),
      signal,
      cache: "no-store",
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      throw new Error(errorMessage(response.status, body as N8nErrorBody | null));
    }

    return normalizeN8nResponse(body);
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new DOMException("Permintaan dibatalkan.", "AbortError");
    }
    if (timeoutSignal.aborted) {
      throw new Error("AI membutuhkan waktu terlalu lama. Coba lagi dengan file atau pertanyaan yang lebih ringkas.");
    }
    if (error instanceof TypeError) {
      throw new Error("Workflow n8n tidak dapat dihubungi. Periksa URL webhook, status workflow, dan CORS.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Terjadi gangguan saat menghubungi workflow n8n.");
  }
}

export { SCOPE_REFUSAL };
