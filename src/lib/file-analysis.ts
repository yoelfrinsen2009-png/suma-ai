export const MAX_INLINE_FILE_BYTES = 7 * 1024 * 1024;
export const MAX_EXTRACTED_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARACTERS = 120_000;
export const ANALYSIS_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  ".tsv",
  ".txt",
  ".md",
  ".json",
  ".html",
  ".xml",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
].join(",");

type InlineMediaType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";

export type InlineAnalysisAttachment = {
  mode: "inline";
  name: string;
  mediaType: InlineMediaType;
  sourceType: string;
  size: number;
  truncated: false;
  data: string;
};

export type TextAnalysisAttachment = {
  mode: "text";
  name: string;
  mediaType: "text/plain";
  sourceType: string;
  size: number;
  truncated: boolean;
  text: string;
  summary: string;
};

export type AnalysisAttachment = InlineAnalysisAttachment | TextAnalysisAttachment;

type AttachmentKind = "inline" | "docx" | "xlsx" | "text";

type FileDescriptor = {
  kind: AttachmentKind;
  mediaType: string;
};

const FILE_TYPES: Record<string, FileDescriptor> = {
  pdf: { kind: "inline", mediaType: "application/pdf" },
  png: { kind: "inline", mediaType: "image/png" },
  jpg: { kind: "inline", mediaType: "image/jpeg" },
  jpeg: { kind: "inline", mediaType: "image/jpeg" },
  webp: { kind: "inline", mediaType: "image/webp" },
  docx: {
    kind: "docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    kind: "xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  csv: { kind: "text", mediaType: "text/csv" },
  tsv: { kind: "text", mediaType: "text/tab-separated-values" },
  txt: { kind: "text", mediaType: "text/plain" },
  md: { kind: "text", mediaType: "text/markdown" },
  json: { kind: "text", mediaType: "application/json" },
  html: { kind: "text", mediaType: "text/html" },
  xml: { kind: "text", mediaType: "text/xml" },
};

const MAX_SHEETS = 12;
const MAX_ROWS_PER_SHEET = 500;
const MAX_COLUMNS_PER_ROW = 50;
const MAX_CELL_CHARACTERS = 1_000;

export function getFileExtension(name: string): string {
  const cleanName = name.trim().toLowerCase();
  const separator = cleanName.lastIndexOf(".");
  return separator >= 0 ? cleanName.slice(separator + 1) : "";
}

export function getFileDescriptor(name: string): FileDescriptor | null {
  return FILE_TYPES[getFileExtension(name)] ?? null;
}

function replaceControlCharacters(
  value: string,
  replacement: string,
  preserveTextWhitespace = false,
): string {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = code < 32 || code === 127;
    if (!isControl || (preserveTextWhitespace && (code === 9 || code === 10))) {
      result += character;
    } else {
      result += replacement;
    }
  }
  return result;
}

export function sanitizeFileName(name: string): string {
  const normalized = replaceControlCharacters(name.normalize("NFKC").replace(/[\\/]/g, "_"), "").trim();
  return (normalized || "file").slice(0, 180);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeExtractedText(value: string): string {
  return replaceControlCharacters(value.normalize("NFKC").replace(/\r\n?/g, "\n"), " ", true)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function limitExtractedText(value: string): { text: string; truncated: boolean } {
  const normalized = normalizeExtractedText(value);
  if (!normalized) {
    throw new Error("File tidak memiliki teks atau data yang dapat dianalisis.");
  }
  if (normalized.length <= MAX_EXTRACTED_TEXT_CHARACTERS) {
    return { text: normalized, truncated: false };
  }
  const notice = "\n\n[Konten dipotong oleh aplikasi karena melewati batas analisis.]";
  return {
    text: `${normalized.slice(0, MAX_EXTRACTED_TEXT_CHARACTERS - notice.length)}${notice}`,
    truncated: true,
  };
}

function bytesStartWith(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

async function validateInlineSignature(file: File, mediaType: InlineMediaType): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const valid = mediaType === "application/pdf"
    ? bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2D])
    : mediaType === "image/png"
      ? bytesStartWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      : mediaType === "image/jpeg"
        ? bytesStartWith(bytes, [0xFF, 0xD8, 0xFF])
        : bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46])
          && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (!valid) {
    throw new Error(`Isi ${file.name} tidak cocok dengan ekstensi filenya.`);
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File tidak berhasil dibaca oleh browser."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      const data = separator >= 0 ? result.slice(separator + 1) : "";
      if (!data) {
        reject(new Error("File tidak berhasil dikodekan untuk analisis."));
        return;
      }
      resolve(data);
    };
    reader.readAsDataURL(file);
  });
}

function serializeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return replaceControlCharacters(
    String(value).normalize("NFKC").replace(/[\t\r\n]+/g, " "),
    " ",
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CELL_CHARACTERS);
}

function serializeWorkbook(
  sheets: Array<{ sheet: string; data: unknown[][] }>,
): { text: string; truncated: boolean; summary: string } {
  const output: string[] = [];
  let totalRows = 0;
  let representedRows = 0;
  let truncated = sheets.length > MAX_SHEETS;

  for (const sheet of sheets) totalRows += sheet.data.length;

  outer:
  for (const sheet of sheets.slice(0, MAX_SHEETS)) {
    output.push(`[SHEET: ${serializeCell(sheet.sheet) || "Tanpa nama"}]`);
    if (sheet.data.length > MAX_ROWS_PER_SHEET) truncated = true;

    for (const row of sheet.data.slice(0, MAX_ROWS_PER_SHEET)) {
      if (row.length > MAX_COLUMNS_PER_ROW) truncated = true;
      const line = row.slice(0, MAX_COLUMNS_PER_ROW).map(serializeCell).join("\t");
      const projectedLength = output.reduce((length, item) => length + item.length + 1, 0) + line.length;
      if (projectedLength > MAX_EXTRACTED_TEXT_CHARACTERS - 120) {
        truncated = true;
        break outer;
      }
      output.push(line);
      representedRows += 1;
    }
    output.push("");
  }

  const base = normalizeExtractedText(output.join("\n"));
  if (!base) throw new Error("Spreadsheet tidak memiliki sel yang dapat dianalisis.");
  const notice = truncated ? "\n\n[Spreadsheet dipotong karena melewati batas baris, kolom, atau karakter.]" : "";
  return {
    text: `${base}${notice}`.slice(0, MAX_EXTRACTED_TEXT_CHARACTERS),
    truncated,
    summary: `${Math.min(sheets.length, MAX_SHEETS)}/${sheets.length} sheet dan ${representedRows}/${totalRows} baris disertakan`,
  };
}

async function prepareDocx(file: File, name: string, sourceType: string): Promise<TextAnalysisAttachment> {
  try {
    const { default: mammoth } = await import("mammoth/mammoth.browser.js");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const limited = limitExtractedText(result.value);
    return {
      mode: "text",
      name,
      mediaType: "text/plain",
      sourceType,
      size: file.size,
      truncated: limited.truncated,
      text: limited.text,
      summary: "Teks paragraf DOCX berhasil diekstrak",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "File tidak memiliki teks atau data yang dapat dianalisis.") {
      throw error;
    }
    throw new Error("DOCX tidak dapat dibaca. Pastikan file tidak rusak atau dilindungi kata sandi.");
  }
}

async function prepareXlsx(file: File, name: string, sourceType: string): Promise<TextAnalysisAttachment> {
  try {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile<string>(file, { parseNumber: (value) => value });
    const serialized = serializeWorkbook(sheets);
    return {
      mode: "text",
      name,
      mediaType: "text/plain",
      sourceType,
      size: file.size,
      truncated: serialized.truncated,
      text: serialized.text,
      summary: serialized.summary,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Spreadsheet tidak memiliki sel yang dapat dianalisis.") {
      throw error;
    }
    throw new Error("XLSX tidak dapat dibaca. Pastikan file tidak rusak atau dilindungi kata sandi.");
  }
}

async function prepareText(file: File, name: string, sourceType: string): Promise<TextAnalysisAttachment> {
  const limited = limitExtractedText(await file.text());
  return {
    mode: "text",
    name,
    mediaType: "text/plain",
    sourceType,
    size: file.size,
    truncated: limited.truncated,
    text: limited.text,
    summary: "Konten teks berhasil dibaca",
  };
}

export async function prepareAnalysisFile(file: File): Promise<AnalysisAttachment> {
  const name = sanitizeFileName(file.name);
  const descriptor = getFileDescriptor(name);
  if (!descriptor) {
    const extension = getFileExtension(name);
    if (extension === "doc" || extension === "xls") {
      throw new Error(`Format .${extension} lama belum didukung. Simpan ulang sebagai .${extension}x atau CSV.`);
    }
    throw new Error("Format file belum didukung. Gunakan PDF, DOCX, XLSX, CSV, teks, JSON, atau gambar.");
  }
  if (file.size <= 0) throw new Error("File kosong dan tidak dapat dianalisis.");

  const maxBytes = descriptor.kind === "inline"
    ? MAX_INLINE_FILE_BYTES
    : MAX_EXTRACTED_FILE_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`Ukuran ${name} melebihi batas ${formatFileSize(maxBytes)}.`);
  }

  if (descriptor.kind === "inline") {
    const mediaType = descriptor.mediaType as InlineMediaType;
    await validateInlineSignature(file, mediaType);
    return {
      mode: "inline",
      name,
      mediaType,
      sourceType: descriptor.mediaType,
      size: file.size,
      truncated: false,
      data: await readAsBase64(file),
    };
  }
  if (descriptor.kind === "docx") return prepareDocx(file, name, descriptor.mediaType);
  if (descriptor.kind === "xlsx") return prepareXlsx(file, name, descriptor.mediaType);
  return prepareText(file, name, descriptor.mediaType);
}
