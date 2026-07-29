import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../n8n/SUM-AI-Analytics-Gemini-Files.workflow.json", import.meta.url);
const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
const nodeByName = (name) => workflow.nodes.find((node) => node.name === name);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function execute(name, json, lookup = () => ({})) {
  return new AsyncFunction("$json", "$input", "$", nodeByName(name).parameters.jsCode)(
    json,
    {},
    lookup,
  );
}

async function configuredRequest(attachment) {
  const input = {
    body: JSON.stringify({
      schemaVersion: "1.0",
      requestId: "file-test-001",
      companyId: "COMPANY-001",
      message: "Analisis lampiran ini",
      history: [],
      copilot: "sum-ai",
      mood: "Fokus",
      ...(attachment ? { attachment } : {}),
    }),
  };
  const configured = await execute("Workflow Configuration", input);
  return execute("Validate Request", configured[0].json);
}

test("workflow file aman untuk diimpor dan seluruh koneksi valid", () => {
  assert.equal(workflow.active, false);
  assert.equal(workflow.name, "SUM-AI | Analytics API + File Analysis → Gemini Fallback → Webhook");
  assert.match(nodeByName("SUM-AI Webhook").parameters.options.allowedOrigins, /localhost:5173/);

  const names = new Set(workflow.nodes.map((node) => node.name));
  for (const [source, connection] of Object.entries(workflow.connections)) {
    assert.equal(names.has(source), true, `Node sumber tidak ditemukan: ${source}`);
    for (const branch of connection.main) {
      for (const edge of branch) {
        assert.equal(names.has(edge.node), true, `Node tujuan tidak ditemukan: ${edge.node}`);
      }
    }
  }
});

test("seluruh Code node workflow file valid secara sintaks", () => {
  for (const node of workflow.nodes.filter((candidate) => candidate.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(() => new Function(node.parameters.jsCode), node.name);
  }
});

test("validasi menerima teks hasil ekstraksi dan menolak base64 rusak", async () => {
  const accepted = await configuredRequest({
    mode: "text",
    name: "laporan.docx",
    mediaType: "text/plain",
    sourceType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 2048,
    truncated: false,
    summary: "Teks DOCX",
    text: "Pendapatan tumbuh 12 persen.",
  });
  assert.equal(accepted[0].json.valid, true);
  assert.equal(accepted[0].json.attachment.name, "laporan.docx");
  assert.equal(accepted[0].json.attachment.text, "Pendapatan tumbuh 12 persen.");

  const rejected = await configuredRequest({
    mode: "inline",
    name: "scan.pdf",
    mediaType: "application/pdf",
    sourceType: "application/pdf",
    size: 3,
    truncated: false,
    data: "bukan-base64",
  });
  assert.equal(rejected[0].json.valid, false);
  assert.match(rejected[0].json.error, /tidak valid atau terlalu besar/);
});

test("prompt Gemini memisahkan Analytics API, metadata, isi file, dan instruksi terbaru", async () => {
  const validated = await configuredRequest({
    mode: "text",
    name: "risiko.csv",
    mediaType: "text/plain",
    sourceType: "text/csv",
    size: 64,
    truncated: true,
    summary: "2 baris",
    text: "pelanggan,risiko\nA,tinggi\nB,rendah",
  });
  const request = validated[0].json;
  const analyticsResponse = {
    success: true,
    data: {
      customer_name: "Toko Singgalang",
      analysis_date: "2026-07-23",
      purchase_history_3_years: {
        summary: { total_invoices: 10, total_amount: 5000, months_active: 6 },
      },
      total_purchase_history: {
        total_invoices: 20,
        total_amount: 9000,
        payment_breakdown: { total_paid_amount: 7500, total_unpaid_amount: 1500 },
      },
      payment_analysis: { average_delay_days: 3, total_invoices_analyzed: 20 },
      aging_analysis: {
        summary: { total_outstanding_invoices: 2, total_outstanding_amount: 1500 },
      },
    },
  };

  const built = await execute(
    "Build Analytics Prompt",
    analyticsResponse,
    () => ({ first: () => ({ json: request }) }),
  );
  assert.equal(built[0].json.ok, true);
  assert.equal(built[0].json.attachmentName, "risiko.csv");
  assert.equal(built[0].json.attachmentTruncated, true);

  const parts = built[0].json.geminiBody.contents.flatMap((content) => content.parts);
  assert.equal(parts.some((part) => part.text?.includes("KONTEKS ANALYTICS PELANGGAN")), true);
  assert.equal(parts.some((part) => part.text?.includes('"fileName": "risiko.csv"')), true);
  assert.equal(parts.some((part) => part.text?.includes("A,tinggi")), true);
  assert.equal(parts.at(-1).text.includes("PERMINTAAN TERBARU:"), true);
  assert.equal(
    built[0].json.geminiBody.systemInstruction.parts[0].text.includes("Jangan mencampur angka kedua sumber"),
    true,
  );
});

test("urutan fallback hanya mencantumkan model yang benar-benar memiliki node", async () => {
  const configured = await execute("Workflow Configuration", {});
  const models = configured[0].json.config.geminiModels;
  assert.deepEqual(models, [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ]);

  const evaluatorModels = workflow.nodes
    .filter((node) => node.name.startsWith("Evaluate "))
    .map((node) => node.parameters.jsCode.match(/const MODEL = '([^']+)'/)?.[1]);
  assert.deepEqual(evaluatorModels, models);
});
