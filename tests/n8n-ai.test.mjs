import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAttachment,
  normalizeHistory,
  normalizeN8nResponse,
  normalizeWebhookUrl,
  sendScopedChat,
  SCOPE_REFUSAL,
} from "../src/lib/n8n-ai.ts";

test("membatasi dan membersihkan riwayat menjadi 10 pesan terakhir", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `  Pesan ${index + 1}  `,
  }));

  const normalized = normalizeHistory(history);
  assert.equal(normalized.length, 10);
  assert.equal(normalized[0].content, "Pesan 3");
  assert.equal(normalized[9].content, "Pesan 12");
});

test("menerima kontrak respons n8n yang benar", () => {
  assert.deepEqual(
    normalizeN8nResponse({ answer: "  Analisis selesai.  ", inScope: true }),
    { answer: "Analisis selesai.", inScope: true },
  );
});

test("mengganti jawaban di luar ruang lingkup dengan penolakan baku", () => {
  assert.deepEqual(
    normalizeN8nResponse({ answer: "Teks model yang tidak boleh tampil", inScope: false }),
    { answer: SCOPE_REFUSAL, inScope: false },
  );
});

test("menolak respons array, field hilang, atau jawaban kosong", () => {
  assert.throws(() => normalizeN8nResponse([{ answer: "x", inScope: true }]));
  assert.throws(() => normalizeN8nResponse({ answer: "x" }));
  assert.throws(() => normalizeN8nResponse({ answer: "  ", inScope: true }));
});

test("menerima URL webhook n8n dan menolak URL editor workflow", () => {
  assert.equal(
    normalizeWebhookUrl(
      "https://automation.geloraaksarapratama.co.id/webhook/sum-ai-copilot-google-sheets-ollama-v1",
    ),
    "https://automation.geloraaksarapratama.co.id/webhook/sum-ai-copilot-google-sheets-ollama-v1",
  );
  assert.throws(
    () => normalizeWebhookUrl(
      "https://automation.geloraaksarapratama.co.id/workflow/k6hnpVxETHEGbEK5",
    ),
    /bukan URL editor workflow/,
  );
  assert.throws(
    () => normalizeWebhookUrl("http://automation.geloraaksarapratama.co.id/webhook/test"),
    /harus menggunakan HTTPS/,
  );
});

test("permintaan jelas di luar scope tidak memanggil webhook", async () => {
  const result = await sendScopedChat({
    message: "Buatkan resep nasi goreng",
    history: [],
    copilot: "sum-ai",
    mood: "Fokus",
  });
  assert.deepEqual(result, { answer: SCOPE_REFUSAL, inScope: false });
});

test("memvalidasi lampiran teks dan base64 sebelum request", () => {
  const textAttachment = {
    mode: "text",
    name: " laporan.csv ",
    mediaType: "text/plain",
    sourceType: "text/csv",
    size: 20,
    truncated: false,
    text: "kolom,nilai\nA,10",
    summary: "  2 baris  ",
  };
  assert.deepEqual(normalizeAttachment(textAttachment), {
    ...textAttachment,
    name: "laporan.csv",
    summary: "2 baris",
  });

  assert.throws(() => normalizeAttachment({
    mode: "inline",
    name: "scan.pdf",
    mediaType: "application/pdf",
    sourceType: "application/pdf",
    size: 3,
    truncated: false,
    data: "rusak",
  }), /Data file multimodal tidak valid/);
});
