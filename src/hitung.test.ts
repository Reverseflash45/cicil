import { describe, expect, it } from "vitest";
import { analisis, bacaAngka, bacaDesimal, bungaPeriode, cicilanAnuitas, cicilanFlat, dariCicilan, dariFlat, dariHarian, nilaiKini, persen, rupiah } from "./hitung";

describe("bunga per periode", () => {
  it("anuitas 1% per bulan 12 kali kembali ke 1% (setara RATE di Excel)", () => {
    const a = cicilanAnuitas(1_000_000, 0.01, 12);
    expect(a).toBeCloseTo(88_848.79, 2);
    expect(bungaPeriode(1_000_000, Array(12).fill(a))).toBeCloseTo(0.01, 10);
  });

  it("tanpa bunga hasilnya nol", () => {
    expect(bungaPeriode(3_000_000, [1_000_000, 1_000_000, 1_000_000])).toBeCloseTo(0, 10);
  });

  it("akar membuat nilai kini nol", () => {
    const bayar = [0, 0, 500_000, 700_000];
    const r = bungaPeriode(1_000_000, bayar);
    expect(Math.abs(nilaiKini(r, 1_000_000, bayar))).toBeLessThan(1e-6);
  });

  it("biaya sangat mahal tetap ditemukan", () => {
    // Pinjam 1 juta, kembalikan 3 juta seminggu kemudian: 200% per periode.
    expect(bungaPeriode(1_000_000, [3_000_000])).toBeCloseTo(2, 8);
  });
});

describe("bunga flat", () => {
  it("cicilan flat 1,5% per bulan 12 bulan", () => {
    expect(cicilanFlat(12_000_000, 0.015, 12)).toBeCloseTo(1_180_000, 6);
  });

  it("flat 1,5% per bulan setara sekitar 2,65% efektif per bulan", () => {
    const h = analisis(dariFlat(12_000_000, 0, 0.015, 12));
    expect(h.r).toBeGreaterThan(0.0264);
    expect(h.r).toBeLessThan(0.0266);
    expect(h.nominalTahun).toBeCloseTo(h.r * 12, 12);
    expect(h.efektifTahun).toBeCloseTo((1 + h.r) ** 12 - 1, 12);
    expect(h.totalBiaya).toBeCloseTo(12_000_000 * 0.015 * 12, 4);
  });

  it("jadwal melunasi utang tepat di cicilan terakhir", () => {
    const h = analisis(dariFlat(12_000_000, 0, 0.015, 12));
    expect(h.jadwal.at(-1)!.sisa).toBe(0);
    expect(h.jadwal[0].bunga).toBeGreaterThan(h.jadwal.at(-1)!.bunga);
    const pokok = h.jadwal.reduce((a, b) => a + b.pokok, 0);
    expect(pokok).toBeCloseTo(12_000_000, 2);
  });
});

describe("potongan dan pinjaman harian", () => {
  it("potongan di awal menaikkan bunga efektif", () => {
    const tanpa = analisis(dariCicilan(3_000_000, 0, 1_000_000, 3, "bulan"));
    const dengan = analisis(dariCicilan(3_000_000, 150_000, 1_000_000, 3, "bulan"));
    expect(tanpa.r).toBeCloseTo(0, 10);
    expect(dengan.r).toBeGreaterThan(0.025);
    expect(dengan.totalBiaya).toBe(150_000);
  });

  it("pinjaman 30 hari 0,3% per hari dilunasi sekali", () => {
    const h = analisis(dariHarian(1_000_000, 0, 0.003, 30));
    expect(h.totalBayar).toBeCloseTo(1_090_000, 6);
    expect(h.biayaPerHari).toBeCloseTo(0.003, 12);
    expect(h.efektifTahun).toBeCloseTo(1.09 ** (365 / 30) - 1, 8);
    expect(h.lamaHari).toBe(30);
  });

  it("biaya per hari ala OJK memakai pokok, bukan uang yang diterima", () => {
    const h = analisis(dariHarian(1_000_000, 50_000, 0.001, 30));
    expect(h.biayaPerHari).toBeCloseTo((30_000 + 50_000) / 1_000_000 / 30, 12);
  });
});

describe("format dan masukan", () => {
  it("rupiah dan persen", () => {
    expect(rupiah(1_180_000)).toBe("Rp1.180.000");
    expect(persen(0.3683)).toBe("36,8%");
    expect(persen(18.52)).toBe("1.852%");
  });
  it("membaca angka", () => {
    expect(bacaAngka("5.000.000")).toBe(5_000_000);
    expect(bacaAngka("Rp 5.000.000")).toBe(5_000_000);
    expect(bacaAngka("1,5 jt")).toBe(1_500_000);
    expect(bacaAngka("750rb")).toBe(750_000);
    expect(bacaAngka("abc")).toBeNaN();
    expect(bacaDesimal("1,5")).toBe(1.5);
  });
});
