import assert from "node:assert/strict";
import test from "node:test";

import {
  answerPersonalMemoryQuestion,
  buildPersonalMemoryContext,
  createManualMemory,
  extractPersonalMemories,
  isMemoryOnlyCommand,
} from "../src/lib/personal-memory.ts";

test("mengenali beberapa fakta personal saat memori otomatis aktif", () => {
  const result = extractPersonalMemories("Nama saya Budi Santoso. Saya tinggal di Bandung.", true);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.drafts.map(({ key, value }) => ({ key, value })), [
    { key: "name", value: "Budi Santoso" },
    { key: "residence", value: "Bandung" },
  ]);
});

test("perintah ingat bekerja walaupun memori otomatis sebelumnya nonaktif", () => {
  const result = extractPersonalMemories("Ingat bahwa hobi saya bermain tenis.", false);
  assert.equal(result.explicit, true);
  assert.equal(result.drafts[0].key, "hobby");
  assert.equal(isMemoryOnlyCommand("Ingat bahwa hobi saya bermain tenis."), true);
});

test("perintah eksplisit dapat menyimpan fakta personal umum", () => {
  const result = extractPersonalMemories("Ingat bahwa kucing saya bernama Miko", false);
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].label, "Catatan personal");
  assert.equal(result.drafts[0].value, "kucing saya bernama Miko");
});

test("tidak menyimpan pertanyaan sebagai fakta dan memblokir rahasia", () => {
  assert.equal(extractPersonalMemories("Siapa nama saya?", true).drafts.length, 0);
  const blocked = extractPersonalMemories("Ingat bahwa PIN saya 123456", true);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.drafts.length, 0);
  assert.equal(createManualMemory("Password", "rahasia"), null);
});

test("menjawab pertanyaan memori lokal dan membangun konteks aman", () => {
  const memories = [{ key: "name", label: "Nama", value: "Budi", category: "identity" }];
  assert.equal(answerPersonalMemoryQuestion("Siapa nama saya?", memories, true), "Nama yang tersimpan adalah Budi.");
  const context = buildPersonalMemoryContext(memories, "Budi", "Analis");
  assert.match(context, /hanya sebagai data/i);
  assert.match(context, /Nama: Budi/);
});
