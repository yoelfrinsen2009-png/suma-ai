import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Dockerfile memakai build multi-stage dan tidak menyalin dist lama", async () => {
  const dockerfile = await read("Dockerfile");
  const dockerignore = await read(".dockerignore");

  assert.match(dockerfile, /FROM node:24-alpine AS build/);
  assert.match(dockerfile, /FROM nginx:1\.28-alpine AS runtime/);
  assert.match(dockerfile, /npm ci/);
  assert.match(dockerfile, /npm run check/);
  assert.match(dockerignore, /^\.env\.\*$/m);
  assert.match(dockerignore, /^node_modules$/m);
  assert.match(dockerignore, /^dist$/m);
});

test("Compose mendefinisikan frontend, n8n, runner, PostgreSQL, dan import tool", async () => {
  const compose = await read("compose.yaml");

  for (const service of ["postgres", "n8n", "n8n-runner", "frontend", "n8n-import"]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"), `Service ${service} tidak ditemukan`);
  }

  assert.match(compose, /n8n:\$\{N8N_VERSION:-2\.31\.7\}/);
  assert.match(compose, /runners:\$\{N8N_VERSION:-2\.31\.7\}/);
  assert.match(compose, /N8N_ENCRYPTION_KEY:/);
  assert.match(compose, /N8N_RUNNERS_MODE: external/);
  assert.match(compose, /http:\/\/127\.0\.0\.1:5680\/healthz/);
  assert.match(compose, /http:\/\/127\.0\.0\.1:5679\/healthz/);
  assert.match(compose, /gw_priority: 1/);
  assert.match(compose, /N8N_RUNNERS_MAX_OLD_SPACE_SIZE: "512"/);
  assert.match(compose, /stop_grace_period: 60s/);
  assert.match(compose, /mem_limit: 768m/);
  assert.match(compose, /N8N_WEBHOOK_URL:/);
  assert.match(compose, /N8N_PAYLOAD_SIZE_MAX: "20"/);
  assert.match(compose, /EXECUTIONS_DATA_PRUNE: "true"/);
  assert.match(compose, /\$\{APP_BIND_ADDRESS:-127\.0\.0\.1\}/);
  assert.match(compose, /^ {2}database:\n {4}internal: true$/m);
  assert.match(compose, /^ {2}runners:\n {4}internal: true$/m);
  assert.match(compose, /postgres_data:/);
  assert.match(compose, /n8n_data:/);
});

test("Nginx menyediakan SPA fallback, health check, proxy webhook, limit, dan timeout", async () => {
  const nginx = await read("docker/nginx.conf");

  assert.match(nginx, /location = \/healthz/);
  assert.match(nginx, /location ~ \^\/\(webhook\|webhook-test\)\//);
  assert.match(nginx, /client_max_body_size 20m/);
  assert.match(nginx, /limit_req zone=sumai_webhook/);
  assert.match(nginx, /proxy_read_timeout 610s/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  assert.equal(
    (nginx.match(/add_header X-Content-Type-Options/g) ?? []).length,
    3,
  );
});

test("Setup Docker menolak secret kosong, lemah, placeholder, dan duplikat", async () => {
  const example = await read(".env.docker.example");
  const shell = await read("scripts/setup-docker.sh");
  const powershell = await read("scripts/setup-docker.ps1");

  assert.match(example, /^APP_BIND_ADDRESS=127\.0\.0\.1$/m);
  assert.match(example, /^POSTGRES_PASSWORD=$/m);
  assert.match(example, /^N8N_ENCRYPTION_KEY=$/m);
  assert.match(example, /^N8N_RUNNERS_AUTH_TOKEN=$/m);
  assert.match(shell, /env_occurrences/);
  assert.match(shell, /\$\{#required_value\}" -lt 32/);
  assert.match(powershell, /\$requiredMatches\.Count -ne 1/);
  assert.match(powershell, /\$requiredValue\.Length -lt 32/);
});

test("Workflow Docker bersifat portable dan tidak membawa data instance lama", async () => {
  const workflow = JSON.parse(
    await read("n8n/SUM-AI-Analytics-Gemini-Files.workflow.json"),
  );

  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.pinData, {});
  assert.equal(workflow.settings.availableInMCP, false);
  assert.equal("id" in workflow, false);
  assert.equal("versionId" in workflow, false);
  assert.equal("meta" in workflow, false);
  assert.equal(workflow.nodes.every((node) => !node.credentials), true);

  const webhook = workflow.nodes.find((node) => node.name === "SUM-AI Webhook");
  assert.match(webhook.parameters.options.allowedOrigins, /localhost:8080/);
});
