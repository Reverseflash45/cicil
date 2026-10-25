/* Perhitungan bunga efektif dari arus uang pinjaman. Semua uang dalam rupiah. */

export type Periode = "hari" | "minggu" | "bulan";
export const PER_TAHUN: Record<Periode, number> = { hari: 365, minggu: 365 / 7, bulan: 12 };
export const HARI_PER: Record<Periode, number> = { hari: 1, minggu: 7, bulan: 365 / 12 };

/** Uang diterima di awal, lalu pembayaran di akhir setiap periode (boleh 0 untuk periode tanpa bayar). */
export type Rencana = { pokok: number; diterima: number; bayar: number[]; periode: Periode };

/** Nilai kini bersih arus: +diterima di awal, −bayar[k] di akhir periode k+1. */
export function nilaiKini(r: number, diterima: number, bayar: number[]): number {
  let n = diterima;
  let faktor = 1;
  for (const b of bayar) {
    faktor /= 1 + r;
    n -= b * faktor;
  }
  return n;
}

/**
 * Bunga per periode yang membuat nilai kini nol (IRR), dicari dengan biseksi.
 * Arusnya selalu satu kali terima lalu bayar, jadi nilai kini naik monoton terhadap r dan akarnya tunggal.
 */
export function bungaPeriode(diterima: number, bayar: number[]): number {
  const total = bayar.reduce((a, b) => a + b, 0);
  if (diterima <= 0 || total <= 0) return NaN;
  let lo = -0.99;
  let hi = 1;
  while (nilaiKini(hi, diterima, bayar) < 0 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (nilaiKini(mid, diterima, bayar) < 0) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  // Sisa pembulatan biseksi di sekitar nol jangan sampai tampil sebagai "-0,00%".
  return Math.abs(r) < 1e-12 ? 0 : r;
}

export type BarisJadwal = { ke: number; bayar: number; bunga: number; pokok: number; sisa: number };
export type Hasil = {
  /** Bunga efektif per periode cicilan. */
  r: number;
  /** Bunga efektif per tahun, dimajemukkan: (1 + r)^periode-per-tahun − 1. */
  efektifTahun: number;
  /** Bunga efektif per bulan. */
  efektifBulan: number;
  /** Bunga per tahun tanpa pemajemukan (r × periode per tahun), cara bank menyebut "bunga efektif p.a.". */
  nominalTahun: number;
  totalBayar: number;
  /** Semua yang kamu bayar di luar uang yang kamu terima: bunga, biaya, potongan. */
  totalBiaya: number;
  lamaHari: number;
  /** Total biaya ÷ pokok ÷ lama pinjaman dalam hari: cara OJK menyatakan batas manfaat ekonomi pinjaman daring. */
  biayaPerHari: number;
  jadwal: BarisJadwal[];
};

export function analisis(p: Rencana): Hasil {
  const r = bungaPeriode(p.diterima, p.bayar);
  const m = PER_TAHUN[p.periode];
  const totalBayar = p.bayar.reduce((a, b) => a + b, 0);
  const totalBiaya = totalBayar - p.diterima;
  const lamaHari = p.bayar.length * HARI_PER[p.periode];
  let sisa = p.diterima;
  const jadwal = p.bayar.map((bayar, i) => {
    const bunga = sisa * r;
    const pokok = bayar - bunga;
    sisa -= pokok;
    return { ke: i + 1, bayar, bunga, pokok, sisa: Math.abs(sisa) < 0.5 ? 0 : sisa };
  });
  return {
    r,
    efektifTahun: (1 + r) ** m - 1,
    efektifBulan: (1 + r) ** (m / 12) - 1,
    nominalTahun: r * m,
    totalBayar,
    totalBiaya,
    lamaHari,
    biayaPerHari: totalBiaya / p.pokok / lamaHari,
    jadwal,
  };
}

/* ---------- cara menyusun rencana ---------- */

/** Cicilan tetap yang sudah diketahui. Potongan di awal mengurangi uang yang diterima. */
export const dariCicilan = (pokok: number, potongan: number, cicilan: number, kali: number, periode: Periode): Rencana => ({
  pokok,
  diterima: pokok - potongan,
  bayar: Array(kali).fill(cicilan),
  periode,
});

/** Bunga flat: bunga dihitung dari pokok awal setiap bulan, tidak ikut turun walau utang berkurang. */
export const cicilanFlat = (pokok: number, bungaBulan: number, bulan: number) => pokok / bulan + pokok * bungaBulan;
export const dariFlat = (pokok: number, potongan: number, bungaBulan: number, bulan: number): Rencana =>
  dariCicilan(pokok, potongan, cicilanFlat(pokok, bungaBulan, bulan), bulan, "bulan");

/** Bunga efektif (anuitas): bunga dihitung dari sisa utang, cicilan tetap. */
export function cicilanAnuitas(pokok: number, bungaBulan: number, bulan: number): number {
  if (bungaBulan === 0) return pokok / bulan;
  return (pokok * bungaBulan) / (1 - (1 + bungaBulan) ** -bulan);
}

/** Pinjaman harian yang dilunasi sekali di akhir, bunga per hari dari pokok. */
export function dariHarian(pokok: number, potongan: number, bungaHari: number, hari: number): Rencana {
  const bayar = Array(hari).fill(0);
  bayar[hari - 1] = pokok * (1 + bungaHari * hari);
  return { pokok, diterima: pokok - potongan, bayar, periode: "hari" };
}

/* ---------- format ---------- */
export const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
export function persen(x: number, d = 1): string {
  if (!Number.isFinite(x)) return "–";
  const p = x * 100;
  const digit = Math.abs(p) >= 1000 ? 0 : d;
  return `${p.toLocaleString("id-ID", { minimumFractionDigits: digit, maximumFractionDigits: digit })}%`;
}
/** "5.000.000" atau "Rp 5 jt" → 5000000. */
export function bacaAngka(s: string): number {
  const t = s.toLowerCase().replace(/rp/g, "").trim();
  const m = t.match(/^([\d.,]+)\s*(rb|ribu|k|jt|juta)?$/);
  if (!m) return NaN;
  const kali = m[2] ? (/^(rb|ribu|k)$/.test(m[2]) ? 1e3 : 1e6) : 1;
  // Dengan satuan, koma adalah desimal ("1,5 jt"); tanpa satuan, titik dan koma pemisah ribuan dibuang.
  const angka = m[2] ? Number(m[1].replace(/\./g, "").replace(",", ".")) : Number(m[1].replace(/[.,]/g, ""));
  return angka * kali;
}
/** "1,5" atau "1.5" → 1.5 */
export const bacaDesimal = (s: string) => Number(s.replace(",", ".").replace(/[^\d.]/g, ""));
