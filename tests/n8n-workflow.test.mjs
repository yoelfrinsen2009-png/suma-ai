import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../n8n/SUM-AI-Google-Sheets-Groq.workflow.json", import.meta.url);
const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
const nodeByName = (name) => workflow.nodes.find((node) => node.name === name);

test("workflow memiliki struktur import n8n dan seluruh koneksi valid", () => {
  assert.equal(workflow.active, false);
  assert.equal(workflow.name, "SUMA-AI | Google Sheets → Groq → Webhook");
  assert.equal(workflow.nodes.length, 17);
  assert.equal(nodeByName("SUMA-AI Webhook").parameters.path, "sum-ai-copilot-google-sheets-ollama-v1");
  assert.equal(
    nodeByName("Get Company Rows").parameters.documentId.value,
    "1Mxw6r8-F5Ac24gtXihwfL9pzdyrmfSnu7E1cE2plTi0",
  );
  assert.equal(nodeByName("Get Company Rows").parameters.sheetName.value, "1829379905");
  assert.equal(nodeByName("Get Company Rows").parameters.sheetName.mode, "id");
  assert.equal(nodeByName("Groq Chat").parameters.authentication, "genericCredentialType");
  assert.equal(nodeByName("Groq Chat").parameters.genericAuthType, "httpBearerAuth");
  assert.equal(nodeByName("Groq Chat").parameters.jsonBody, "={{ $json.groqBody }}");
  assert.equal(nodeByName("Ollama Chat"), undefined);
  assert.equal(nodeByName("Parse Ollama Response"), undefined);
  assert.equal(workflow.nodes.every((node) => !node.credentials), true);
  assert.doesNotMatch(JSON.stringify(workflow), /gsk_[A-Za-z0-9_-]+/);

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

test("seluruh Code node valid secara sintaks JavaScript", () => {
  for (const node of workflow.nodes.filter((candidate) => candidate.type === "n8n-nodes-base.code")) {
    assert.doesNotThrow(() => new Function(node.parameters.jsCode), node.name);
  }
});

test("kontrak validasi, grounding data, body Groq, dan parser berjalan", async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = async (name, json, input, lookup) => {
    const code = nodeByName(name).parameters.jsCode;
    return new AsyncFunction("$json", "$input", "$", code)(json, input, lookup);
  };

  const webhookInput = {
    body: JSON.stringify({
      schemaVersion: "1.0",
      requestId: "test-001",
      companyId: "COMPANY-001",
      message: "Analisis pendapatan",
      history: [],
      copilot: "sum-ai",
      mood: "Fokus",
    }),
  };

  const configured = await execute(
    "Workflow Configuration",
    webhookInput,
    {},
    () => ({}),
  );

  const validated = await execute(
    "Validate Request",
    configured[0].json,
    {},
    () => ({}),
  );
  assert.equal(validated[0].json.valid, true);
  const request = validated[0].json;

  const grounded = await execute(
    "Build Grounded Prompt",
    {},
    {
      all: () => [{
        json: {
          company_id: "COMPANY-001",
          metric: "Pendapatan",
          value: 100,
          period: "2026-Q2",
          active: true,
        },
      }],
    },
    () => ({ first: () => ({ json: request }) }),
  );
  assert.equal(grounded[0].json.ok, true);
  assert.equal(grounded[0].json.dataRows, 1);
  assert.equal(grounded[0].json.groqUrl, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(grounded[0].json.groqBody.model, "openai/gpt-oss-20b");
  assert.equal(grounded[0].json.groqBody.response_format.type, "json_schema");
  assert.equal(grounded[0].json.groqBody.response_format.json_schema.strict, true);

  const context = grounded[0].json;
  const parsed = await execute(
    "Parse Groq Response",
    { choices: [{ message: { content: JSON.stringify({ inScope: true, answer: "Pendapatan tercatat 100." }) } }] },
    {},
    () => ({ first: () => ({ json: context }) }),
  );
  assert.equal(parsed[0].json.ok, true);
  assert.equal(parsed[0].json.answer, "Pendapatan tercatat 100.");

  const parsedFenced = await execute(
    "Parse Groq Response",
    { choices: [{ message: { content: '```json\n{"inScope":true,"answer":"Format aman."}\n```' } }] },
    {},
    () => ({ first: () => ({ json: context }) }),
  );
  assert.equal(parsedFenced[0].json.ok, true);
  assert.equal(parsedFenced[0].json.answer, "Format aman.");

  const refused = await execute(
    "Parse Groq Response",
    { choices: [{ message: { content: JSON.stringify({ inScope: false, answer: "" }) } }] },
    {},
    () => ({ first: () => ({ json: context }) }),
  );
  assert.equal(refused[0].json.ok, true);
  assert.equal(refused[0].json.inScope, false);
  assert.match(refused[0].json.answer, /di luar ruang lingkup SUMA-AI/);
});
