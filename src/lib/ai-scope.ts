export const SCOPE_REFUSAL =
  "Maaf, pertanyaan itu di luar ruang lingkup SUMA-AI. Saya hanya dapat membantu analisis data dan bisnis, proposal/kredit, risiko, ringkasan SW1H, navigasi workspace, serta dukungan awal sistem IT.";

const WORK_CONTEXT =
  /\b(analisis|analisa|data|bisnis|usaha|perusahaan|proposal|saldo|kredit|risiko|pembayaran|bank|banking|crm|sw1h|5w1h|ringkasan|laporan|manajemen|indikator|dashboard|workspace|sistem|aplikasi|it|teknologi|akses|akun|tiket|troubleshoot|error|dokumen|mitigasi|rekomendasi|keputusan|operasional|keuangan|nasabah|pelanggan|angsuran|kelayakan)\b/i;

const ANALYTICAL_INTENT =
  /\b(analisis|analisa|evaluasi|bandingkan|ringkas|laporan|hitung|identifikasi|mitigasi)\b/i;

const RECIPE_REQUEST =
  /\b(resep|cara memasak|cara masak|bumbu masakan|menu masakan|kuliner)\b/i;

const CLEARLY_OFF_TOPIC = [
  RECIPE_REQUEST,
  /\b(lirik lagu|sinopsis film|ramalan zodiak|horoskop)\b/i,
  /\b(hasil pertandingan|prediksi skor|klasemen sepak bola)\b/i,
  /\b(tips pacaran|jodoh|cerita cinta)\b/i,
  /\b(diagnosis penyakit|dosis obat|program diet|ramuan kesehatan)\b/i,
  /\b(itinerary liburan|rekomendasi wisata|tiket pesawat|hotel murah)\b/i,
];

/**
 * Penolakan lokal untuk permintaan yang sangat jelas di luar konteks.
 * Permintaan ambigu tetap diperiksa lagi oleh model melalui structured output.
 */
export function isClearlyOutOfScope(message: string): boolean {
  const normalized = message.normalize("NFKC").trim();
  if (!normalized) return false;
  // Resep untuk konsumsi pribadi ditolak. Analisis resep sebagai data bisnis
  // tetap boleh diteruskan ke pemeriksaan model (misalnya analisis biaya produk).
  if (RECIPE_REQUEST.test(normalized)) {
    return !(WORK_CONTEXT.test(normalized) && ANALYTICAL_INTENT.test(normalized));
  }
  const clearlyOffTopic = CLEARLY_OFF_TOPIC.some((pattern) => pattern.test(normalized));
  if (!clearlyOffTopic) return false;
  return !(WORK_CONTEXT.test(normalized) && ANALYTICAL_INTENT.test(normalized));
}
