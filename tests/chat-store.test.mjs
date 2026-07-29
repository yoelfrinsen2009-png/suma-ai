import assert from "node:assert/strict";
import test from "node:test";

import { formatSessionTime, makeSessionTitle } from "../src/lib/chat-store.ts";

test("judul sesi berasal dari prompt pertama dan dibatasi", () => {
  assert.equal(makeSessionTitle("  Analisis   data penjualan  "), "Analisis data penjualan");
  const title = makeSessionTitle("a".repeat(100));
  assert.equal(title.length, 64);
  assert.match(title, /\.\.\.$/);
});

test("waktu sesi hari ini ditampilkan sebagai jam", () => {
  const result = formatSessionTime(Date.now());
  assert.match(result, /^\d{2}[.:]\d{2}$/);
});
