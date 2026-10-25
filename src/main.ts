import "@fontsource-variable/schibsted-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./gaya.css";
import {
  type Hasil,
  type Periode,
  type Rencana,
  analisis,
  bacaAngka,
  bacaDesimal,
  cicilanAnuitas,
  cicilanFlat,
  dariCicilan,
  dariFlat,
  dariHarian,
  persen,
  rupiah,
} from "./hitung";
import { gambarFlat, gambarJadwal } from "./vis";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const form = $<HTMLFormElement>("#formulir");
const isian = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement;
const angkaRp = (n: number) => Math.round(n).toLocaleString("id-ID");
const desimal = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 3 });

type Mode = "cicilan" | "flat" | "harian";
const RUPIAH = ["pokok", "potongan", "cicilan"];
const NAMA_PERIODE: Record<Periode, string> = { hari: "hari", minggu: "minggu", bulan: "bulan" };

/* ---------- contoh ---------- */
type Isian = Record<string, string> & { mode: Mode };
const CONTOH: Record<string, Isian> = {
  motor: { mode: "flat", pokok: "15.000.000", potongan: "500.000", flat: "1,5", bulan: "24" },
  paylater: { mode: "cicilan", pokok: "3.000.000", potongan: "0", cicilan: "1.090.000", kali: "3", periode: "bulan" },
  mingguan: { mode: "cicilan", pokok: "1.000.000", potongan: "100.000", cicilan: "125.000", kali: "10", periode: "minggu" },
  harian: { mode: "harian", pokok: "2.000.000", potongan: "0", harian: "0,3", hari: "30" },
};
const AWAL: Isian = { ...CONTOH.motor, cicilan: "1.150.000", kali: "24", periode: "bulan", harian: "0,3", hari: "30" };

function isiForm(nilai: Partial<Isian>) {
  for (const [k, v] of Object.entries(nilai)) {
    if (k === "mode") {
      const r = form.querySelector<HTMLInputElement>(`input[name="mode"][value="${v}"]`);
      if (r) r.checked = true;
    } else {
      const el = isian(k);
      if (el && v !== undefined) el.value = v;
    }
  }
}
const modeKini = () => (new FormData(form).get("mode") as Mode) ?? "cicilan";

/* ---------- baca formulir ---------- */
type Baca = { rencana: Rencana | null; galat: string | null };

function baca(): Baca {
  form.querySelectorAll("input").forEach((el) => el.removeAttribute("aria-invalid"));
  const salah = (nama: string, pesan: string): Baca => {
    isian(nama).setAttribute("aria-invalid", "true");
    return { rencana: null, galat: pesan };
  };
  const mode = modeKini();
  const pokok = bacaAngka(isian("pokok").value);
  const potongan = isian("potongan").value.trim() ? bacaAngka(isian("potongan").value) : 0;
  if (!(pokok > 0)) return salah("pokok", "Isi pokok pinjaman, misalnya 5.000.000.");
  if (!(potongan >= 0) || potongan >= pokok) return salah("potongan", "Potongan harus di antara 0 dan pokok pinjaman.");
  if (mode === "cicilan") {
    const cicilan = bacaAngka(isian("cicilan").value);
    const kali = Number(isian("kali").value);
    if (!(cicilan > 0)) return salah("cicilan", "Isi besar cicilan.");
    if (!Number.isInteger(kali) || kali < 1 || kali > 600) return salah("kali", "Jumlah cicilan antara 1 dan 600 kali.");
    return { rencana: dariCicilan(pokok, potongan, cicilan, kali, isian("periode").value as Periode), galat: null };
  }
  if (mode === "flat") {
    const b = bacaDesimal(isian("flat").value);
    const bulan = Number(isian("bulan").value);
    if (!(b >= 0 && b <= 20)) return salah("flat", "Bunga flat antara 0 dan 20% per bulan.");
    if (!Number.isInteger(bulan) || bulan < 1 || bulan > 360) return salah("bulan", "Lama antara 1 dan 360 bulan.");
    return { rencana: dariFlat(pokok, potongan, b / 100, bulan), galat: null };
  }
  const b = bacaDesimal(isian("harian").value);
  const hari = Number(isian("hari").value);
  if (!(b >= 0 && b <= 5)) return salah("harian", "Bunga harian antara 0 dan 5% per hari.");
  if (!Number.isInteger(hari) || hari < 1 || hari > 365) return salah("hari", "Lama antara 1 dan 365 hari.");
  return { rencana: dariHarian(pokok, potongan, b / 100, hari), galat: null };
}

/* ---------- struk ---------- */
/** Batas manfaat ekonomi pindar konsumtif per hari menurut pengumuman OJK yang berlaku sejak 1 Januari 2025. */
const batasOjk = (lamaHari: number) => (lamaHari < 182.5 ? 0.003 : 0.002);

function tampilStruk(p: Rencana, h: Hasil) {
  const lunasSekali = p.bayar.filter((b) => b > 0).length === 1;
  const n = p.bayar.length;
  const satuan = NAMA_PERIODE[p.periode];
  const baris: [string, string][] = [
    ["Pokok pinjaman", rupiah(p.pokok)],
    ["Potongan di awal", p.pokok === p.diterima ? rupiah(0) : `−${rupiah(p.pokok - p.diterima)}`],
    ["Uang diterima", rupiah(p.diterima)],
    ["", ""],
    lunasSekali ? [`Dilunasi hari ke-${n}`, rupiah(h.totalBayar)] : ["Cicilan", `${n} × ${rupiah(p.bayar[0])}`],
    ["Total dibayar", rupiah(h.totalBayar)],
    ["Total biaya", `${rupiah(h.totalBiaya)}`],
    ["Biaya ÷ uang diterima", persen(h.totalBiaya / p.diterima)],
    ["", ""],
    [`Bunga efektif per ${satuan}`, persen(h.r, 2)],
    ["Per tahun tanpa majemuk", persen(h.nominalTahun)],
  ];
  $("[data-rincian]").innerHTML = baris.map(([a, b]) => (a ? `<dt>${a}</dt><dd>${b}</dd>` : `<div class="pisah" role="presentation"></div>`)).join("");

  const negatif = h.r < -1e-9;
  $("[data-efektif-tahun]").textContent = negatif ? "di bawah 0%" : persen(Math.max(0, h.efektifTahun));
  $("[data-efektif-bulan]").textContent = negatif ? "Kamu membayar lebih sedikit dari uang yang diterima." : `= ${persen(Math.max(0, h.efektifBulan), 2)} per bulan dari sisa utang`;

  const terima = `Kamu menerima <strong>${rupiah(p.diterima)}</strong>`;
  $("[data-kalimat]").innerHTML = lunasSekali
    ? `${terima} dan melunasi <strong>${rupiah(h.totalBayar)}</strong> setelah ${n} hari. Kalau pinjaman seperti ini terus diperpanjang selama setahun, bunganya setara ${persen(h.efektifTahun, 0)} per tahun.`
    : h.totalBiaya <= 0.5
      ? `${terima} dan membayar kembali jumlah yang sama. Tidak ada bunga.`
      : `${terima} dan membayar ${n} × ${rupiah(p.bayar[0])} per ${satuan}. Itu sama dengan meminjam dengan bunga <strong>${persen(h.r, 2)} per ${satuan}</strong> yang dihitung dari sisa utang.`;

  const ojk = $("[data-ojk]");
  ojk.hidden = !(modeKini() === "harian" || p.periode !== "bulan");
  if (!ojk.hidden) {
    const batas = batasOjk(h.lamaHari);
    const lewat = h.biayaPerHari > batas + 1e-12;
    ojk.innerHTML =
      `Biaya per hari, cara OJK menghitung: <strong>${persen(h.biayaPerHari, 3)}</strong> dari pokok. ` +
      `<span class="status ${lewat ? "lewat" : "dalam"}">${lewat ? "⚠ Di atas" : "✓ Dalam"} batas ${persen(batas, 1)} per hari</span> ` +
      `untuk pindar konsumtif tenor ${h.lamaHari < 182.5 ? "di bawah 6 bulan" : "6 bulan ke atas"} sejak 2025. <a href="#harian">Tentang batas ini</a>`;
  }
}

/* ---------- jadwal ---------- */
function tampilJadwal(p: Rencana, h: Hasil) {
  const bagian = $("[data-bagian-jadwal]");
  const lunasSekali = p.bayar.filter((b) => b > 0).length === 1;
  bagian.hidden = lunasSekali || h.totalBiaya <= 0.5;
  if (bagian.hidden) return;
  const j = h.jadwal;
  const satuan = NAMA_PERIODE[p.periode];
  const separuh = Math.ceil(j.length / 2);
  const bungaAwal = j.slice(0, separuh).reduce((a, b) => a + b.bunga, 0);
  $("[data-pengantar-jadwal]").textContent =
    `Dengan bunga efektif, bunga dihitung dari sisa utang, jadi porsinya besar di awal lalu mengecil. ` +
    `Dari cicilan pertama ${rupiah(j[0].bayar)}, ${rupiah(j[0].bunga)} adalah bunga; di cicilan terakhir tinggal ${rupiah(j.at(-1)!.bunga)}. ` +
    `${persen(bungaAwal / h.totalBiaya, 0)} dari seluruh biaya terbayar di paruh pertama.` +
    (p.pokok !== p.diterima ? " Potongan di awal sudah dihitung sebagai biaya." : "");
  gambarJadwal($("#grafik-jadwal"), j, `per ${satuan}`);
  $("[data-tabel-jadwal]").innerHTML = j
    .map((b) => `<tr><td>${b.ke}</td><td>${angkaRp(b.bayar)}</td><td>${angkaRp(b.pokok)}</td><td>${angkaRp(b.bunga)}</td><td>${angkaRp(b.sisa)}</td></tr>`)
    .join("");
}

/* ---------- hitung ulang ---------- */
function perbarui() {
  const mode = modeKini();
  form.querySelectorAll<HTMLElement>("[data-untuk]").forEach((el) => (el.hidden = el.dataset.untuk !== mode));
  const { rencana, galat } = baca();
  const kotakGalat = $("[data-galat]");
  kotakGalat.hidden = !galat;
  kotakGalat.textContent = galat ?? "";
  if (!rencana) return;
  const h = analisis(rencana);
  tampilStruk(rencana, h);
  tampilJadwal(rencana, h);
  const data = new FormData(form);
  const simpan = new URLSearchParams();
  for (const [k, v] of data) if (typeof v === "string" && v.trim()) simpan.set(k, v.trim());
  history.replaceState(null, "", `#${simpan.toString()}`);
}

form.addEventListener("input", perbarui);
form.addEventListener("change", perbarui);
form.addEventListener("submit", (e) => e.preventDefault());
// Rapikan pemisah ribuan setelah selesai mengetik.
for (const n of RUPIAH)
  isian(n).addEventListener("blur", () => {
    const v = bacaAngka(isian(n).value);
    if (Number.isFinite(v)) isian(n).value = angkaRp(v);
  });
document.querySelectorAll<HTMLButtonElement>("[data-contoh]").forEach((b) =>
  b.addEventListener("click", () => {
    isiForm(CONTOH[b.dataset.contoh!]);
    perbarui();
  }),
);

/* ---------- pembuka dan bagian penjelas ---------- */
function isiPembuka() {
  const h = analisis(dariFlat(12_000_000, 0, 0.015, 12));
  $("[data-judul]").innerHTML = `Bunga flat 1,5% sebulan sebenarnya <em>${persen(h.efektifTahun, 0)}</em> setahun.`;
  $("[data-lead]").textContent =
    `Bunga flat dihitung dari pokok awal, padahal utangmu terus berkurang. Biaya admin yang dipotong di awal, paylater dengan "biaya layanan", ` +
    `dan pinjaman harian juga menyembunyikan bunga. Masukkan uang yang kamu terima dan yang harus kamu bayar, dan Cicil menghitung bunga efektifnya: ` +
    `angka yang bisa dibandingkan antarpinjaman.`;
}

const REF = { pokok: 12_000_000, bunga: 0.015, bulan: 12 };
function isiFlat() {
  const flatBulan = REF.pokok * REF.bunga;
  let sisa = REF.pokok;
  const a = cicilanAnuitas(REF.pokok, REF.bunga, REF.bulan);
  const efektif = Array.from({ length: REF.bulan }, () => {
    const b = sisa * REF.bunga;
    sisa -= a - b;
    return b;
  });
  const totalEfektif = efektif.reduce((x, y) => x + y, 0);
  const setara = analisis(dariFlat(REF.pokok, 0, REF.bunga, REF.bulan));
  $("[data-pengantar-flat]").textContent =
    `Pinjam ${rupiah(REF.pokok)} selama ${REF.bulan} bulan dengan bunga flat 1,5% per bulan: bunganya ${rupiah(flatBulan)} setiap bulan, total ${rupiah(flatBulan * REF.bulan)}, ` +
    `walau di bulan terakhir utangmu tinggal ${rupiah(REF.pokok / REF.bulan)}. Dengan bunga efektif 1,5% dari sisa utang, bunga bulan pertama sama, tapi turun sampai ${rupiah(efektif.at(-1)!)} ` +
    `di bulan terakhir, total ${rupiah(totalEfektif)}. Supaya biayanya sama dengan flat, bunga efektifnya harus ${persen(setara.r, 2)} per bulan.`;
  gambarFlat($("#grafik-flat"), Array(REF.bulan).fill(flatBulan), efektif);

  const tenor = [6, 12, 24, 36];
  const flat = [0.5, 1, 1.5, 2, 2.5, 3];
  $("[data-tabel-konversi]").innerHTML =
    `<thead><tr><th scope="col">Flat / bulan</th>${tenor.map((t) => `<th scope="col">${t} bulan</th>`).join("")}</tr></thead><tbody>` +
    flat
      .map(
        (f) =>
          `<tr class="${f === 1.5 ? "sorot" : ""}"><td>${desimal(f)}%</td>${tenor
            .map((t) => `<td>${persen(analisis(dariCicilan(1e6, 0, cicilanFlat(1e6, f / 100, t), t, "bulan")).efektifTahun)}</td>`)
            .join("")}</tr>`,
      )
      .join("") +
    "</tbody>";
}

function isiHarian() {
  const satuJuta = 1_000_000;
  const h = analisis(dariHarian(satuJuta, 0, 0.003, 30));
  $("[data-pengantar-harian]").textContent =
    `0,3% sehari kedengarannya kecil: untuk pinjaman ${rupiah(satuJuta)}, ${rupiah(satuJuta * 0.003)} sehari. Setelah 30 hari jadi ${rupiah(h.totalBiaya)}, ` +
    `atau ${persen(h.totalBiaya / satuJuta, 0)} dari pokok. Kalau pinjaman 30 hari seperti itu terus diperpanjang selama setahun, bunganya setara ${persen(h.efektifTahun, 0)} per tahun.`;
  const baris = [0.1, 0.2, 0.3, 0.5, 1];
  $("[data-tabel-harian]").innerHTML =
    `<thead><tr><th scope="col">Per hari</th><th scope="col">Biaya 30 hari, pinjam Rp1 juta</th><th scope="col">Per tahun tanpa majemuk</th><th scope="col">Efektif per tahun, diperpanjang tiap 30 hari</th></tr></thead><tbody>` +
    baris
      .map((b) => {
        const x = analisis(dariHarian(satuJuta, 0, b / 100, 30));
        return `<tr class="${b === 0.3 ? "sorot" : ""}"><td>${desimal(b)}%</td><td>${rupiah(x.totalBiaya)}</td><td>${persen((b / 100) * 365, 0)}</td><td>${persen(x.efektifTahun, 0)}</td></tr>`;
      })
      .join("") +
    "</tbody>";
}

/* ---------- mulai ---------- */
const dariHash = Object.fromEntries(new URLSearchParams(location.hash.slice(1))) as Partial<Isian>;
isiForm(AWAL);
if (dariHash.mode) isiForm(dariHash);
isiPembuka();
isiHarian();
function gambarSemua() {
  isiFlat();
  perbarui();
}
gambarSemua();

let lebarTerakhir = document.body.clientWidth;
new ResizeObserver(() => {
  const w = document.body.clientWidth;
  if (w === lebarTerakhir) return;
  lebarTerakhir = w;
  gambarSemua();
}).observe(document.body);
