import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatFileSize,
  getFileDescriptor,
  getFileExtension,
  MAX_EXTRACTED_TEXT_CHARACTERS,
  prepareAnalysisFile,
  sanitizeFileName,
} from "../src/lib/file-analysis.ts";

test("mendeteksi format dan membersihkan nama file", () => {
  assert.equal(getFileExtension("LAPORAN.Final.XLSX"), "xlsx");
  assert.equal(getFileDescriptor("laporan.pdf")?.kind, "inline");
  assert.equal(getFileDescriptor("laporan.docx")?.kind, "docx");
  assert.equal(getFileDescriptor("laporan.exe"), null);
  assert.equal(sanitizeFileName("../laporan\u0000.csv"), ".._laporan.csv");
});

test("memformat ukuran file untuk antarmuka", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2.0 MB");
});

test("membaca file teks dan mempertahankan metadata sumber", async () => {
  const file = new File(["Nama,Nilai\r\nA,100\r\nB,250"], "data.csv", { type: "text/csv" });
  const attachment = await prepareAnalysisFile(file);

  assert.equal(attachment.mode, "text");
  assert.equal(attachment.name, "data.csv");
  assert.equal(attachment.sourceType, "text/csv");
  assert.equal(attachment.truncated, false);
  assert.match(attachment.text, /A,100\nB,250/);
});

test("mengekstrak teks DOCX nyata", async () => {
  const fixture = await readFile(new URL(
    "../node_modules/mammoth/test/test-data/single-paragraph.docx",
    import.meta.url,
  ));
  const attachment = await prepareAnalysisFile(new File([fixture], "contoh.docx"));

  assert.equal(attachment.mode, "text");
  assert.equal(attachment.sourceType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match(attachment.text, /Walking on imported air/);
});

test("memotong teks panjang secara eksplisit", async () => {
  const file = new File(["x".repeat(MAX_EXTRACTED_TEXT_CHARACTERS + 500)], "panjang.txt");
  const attachment = await prepareAnalysisFile(file);

  assert.equal(attachment.mode, "text");
  assert.equal(attachment.truncated, true);
  assert.equal(attachment.text.length, MAX_EXTRACTED_TEXT_CHARACTERS);
  assert.match(attachment.text, /Konten dipotong/);
});

test("menolak format lama, format asing, dan file kosong", async () => {
  await assert.rejects(
    prepareAnalysisFile(new File(["legacy"], "laporan.xls")),
    /Simpan ulang sebagai \.xlsx atau CSV/,
  );
  await assert.rejects(
    prepareAnalysisFile(new File(["program"], "aplikasi.exe")),
    /Format file belum didukung/,
  );
  await assert.rejects(
    prepareAnalysisFile(new File([], "kosong.txt")),
    /File kosong/,
  );
});
