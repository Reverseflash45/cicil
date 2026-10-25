import { scaleBand, scaleLinear } from "d3-scale";
import { type BarisJadwal, rupiah } from "./hitung";

export function buatTip(wadah: HTMLElement) {
  const el = document.createElement("div");
  el.className = "tip";
  el.hidden = true;
  wadah.append(el);
  return {
    tampil(x: number, y: number, html: string) {
      el.innerHTML = html;
      el.hidden = false;
      const w = el.offsetWidth;
      const kiri = x + 14 + w > wadah.clientWidth ? x - 14 - w : x + 14;
      el.style.left = `${Math.max(0, kiri)}px`;
      el.style.top = `${Math.max(0, y - el.offsetHeight - 10)}px`;
    },
    sembunyi() {
      el.hidden = true;
    },
  };
}

/** Angka sumbu ringkas: 1.500.000 → "1,5 jt". */
export function ringkas(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("id-ID")} rb`;
  return Math.round(n).toLocaleString("id-ID");
}

/** Label sumbu x yang tidak berdesakan: pertama, terakhir, dan kelipatan rapi di antaranya. */
function labelKe(n: number, lebarPlot: number): number[] {
  const muat = Math.max(2, Math.floor(lebarPlot / 46));
  if (n <= muat) return Array.from({ length: n }, (_, i) => i + 1);
  const langkah = [2, 3, 4, 5, 6, 10, 12, 20, 24, 30, 50, 60, 100, 120].find((s) => n / s <= muat - 1) ?? Math.ceil(n / muat);
  // Label pertama dan terakhir selalu ada; kelipatan yang terlalu dekat dengan keduanya dilewati.
  const xs = [1];
  for (let k = langkah; k < n; k += langkah) if (k - 1 >= langkah * 0.75 && n - k >= langkah * 0.5) xs.push(k);
  xs.push(n);
  return xs;
}

const RUANG = 2;

/** Batang bertumpuk per cicilan: pokok di bawah, bunga di atas. */
export function gambarJadwal(wadah: HTMLElement, jadwal: BarisJadwal[], satuan: string): void {
  const lebar = Math.max(300, wadah.clientWidth);
  const tinggi = lebar < 560 ? 230 : 280;
  const m = { atas: 12, kanan: 8, bawah: 26, kiri: 52 };
  const x = scaleBand<number>()
    .domain(jadwal.map((b) => b.ke))
    .range([m.kiri, lebar - m.kanan])
    .paddingInner(jadwal.length > 60 ? 0 : 0.18);
  const maks = Math.max(...jadwal.map((b) => b.bayar));
  const y = scaleLinear().domain([0, maks]).nice(4).range([tinggi - m.bawah, m.atas]);
  const bw = x.bandwidth();
  // Celah 2px antara pokok dan bunga hanya bila batangnya cukup tinggi.
  const kolom = jadwal
    .map((b) => {
      const x0 = x(b.ke)!;
      const yPokok = y(Math.max(0, b.pokok));
      const yAtas = y(b.bayar);
      const celah = yPokok - yAtas > RUANG * 2 ? RUANG : 0;
      return `<g class="kolom" data-ke="${b.ke}">
        <rect class="batang-latar" x="${x0}" y="${m.atas}" width="${Math.max(bw, 1)}" height="${tinggi - m.bawah - m.atas}"/>
        <rect class="batang-pokok" x="${x0}" y="${yPokok}" width="${Math.max(bw, 1)}" height="${Math.max(0, y(0) - yPokok)}"/>
        <rect class="batang-bunga" x="${x0}" y="${yAtas}" width="${Math.max(bw, 1)}" height="${Math.max(0, yPokok - yAtas - celah)}"/>
      </g>`;
    })
    .join("");
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}" role="img">
    ${y
      .ticks(4)
      .map((v) => `<line class="kisi" x1="${m.kiri}" x2="${lebar - m.kanan}" y1="${y(v)}" y2="${y(v)}"/><text class="sumbu" x="${m.kiri - 8}" y="${y(v) + 4}" text-anchor="end">${ringkas(v)}</text>`)
      .join("")}
    ${kolom}
    ${labelKe(jadwal.length, lebar - m.kiri - m.kanan)
      .map((k) => `<text class="sumbu" x="${x(k)! + bw / 2}" y="${tinggi - 8}" text-anchor="middle">${k}</text>`)
      .join("")}
  </svg>`;
  const a = jadwal[0];
  const z = jadwal.at(-1)!;
  wadah.querySelector("svg")!.setAttribute(
    "aria-label",
    `${jadwal.length} cicilan. Cicilan pertama ${rupiah(a.pokok)} pokok dan ${rupiah(a.bunga)} bunga; cicilan terakhir ${rupiah(z.pokok)} pokok dan ${rupiah(z.bunga)} bunga.`,
  );
  const tip = buatTip(wadah);
  const svg = wadah.querySelector("svg")!;
  svg.addEventListener("pointermove", (e) => {
    const g = (e.target as Element).closest<SVGGElement>(".kolom");
    if (!g) return tip.sembunyi();
    const b = jadwal[Number(g.dataset.ke) - 1];
    const k = svg.getBoundingClientRect();
    tip.tampil(
      e.clientX - k.left,
      e.clientY - k.top,
      `<b>Cicilan ke-${b.ke}</b> (${satuan})<br>Bayar ${rupiah(b.bayar)}<br>Pokok ${rupiah(b.pokok)}<br>Bunga ${rupiah(b.bunga)}<br>Sisa ${rupiah(b.sisa)}`,
    );
  });
  svg.addEventListener("pointerleave", () => tip.sembunyi());
}

/** Bunga per bulan: flat (tetap) di samping efektif (menurun), batang berpasangan. */
export function gambarFlat(wadah: HTMLElement, flat: number[], efektif: number[]): void {
  const lebar = Math.max(300, wadah.clientWidth);
  const tinggi = lebar < 560 ? 220 : 260;
  const m = { atas: 12, kanan: 8, bawah: 26, kiri: 52 };
  const n = flat.length;
  const x = scaleBand<number>()
    .domain(flat.map((_, i) => i + 1))
    .range([m.kiri, lebar - m.kanan])
    .paddingInner(0.28);
  const sub = scaleBand<number>().domain([0, 1]).range([0, x.bandwidth()]).paddingInner(0.08);
  const y = scaleLinear()
    .domain([0, Math.max(...flat, ...efektif)])
    .nice(4)
    .range([tinggi - m.bawah, m.atas]);
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}" role="img">
    ${y
      .ticks(4)
      .map((v) => `<line class="kisi" x1="${m.kiri}" x2="${lebar - m.kanan}" y1="${y(v)}" y2="${y(v)}"/><text class="sumbu" x="${m.kiri - 8}" y="${y(v) + 4}" text-anchor="end">${ringkas(v)}</text>`)
      .join("")}
    ${flat
      .map(
        (f, i) => `<g class="kolom" data-i="${i}">
        <rect class="batang-latar" x="${x(i + 1)}" y="${m.atas}" width="${x.bandwidth()}" height="${tinggi - m.bawah - m.atas}"/>
        <rect class="batang-bunga" x="${x(i + 1)! + sub(0)!}" y="${y(f)}" width="${sub.bandwidth()}" height="${y(0) - y(f)}" rx="2"/>
        <rect class="batang-pokok" x="${x(i + 1)! + sub(1)!}" y="${y(efektif[i])}" width="${sub.bandwidth()}" height="${y(0) - y(efektif[i])}" rx="2"/>
      </g>`,
      )
      .join("")}
    ${labelKe(n, lebar - m.kiri - m.kanan)
      .map((k) => `<text class="sumbu" x="${x(k)! + x.bandwidth() / 2}" y="${tinggi - 8}" text-anchor="middle">bln ${k}</text>`)
      .join("")}
  </svg>`;
  wadah.querySelector("svg")!.setAttribute(
    "aria-label",
    `Bunga per bulan. Flat: ${rupiah(flat[0])} setiap bulan. Efektif: dari ${rupiah(efektif[0])} turun ke ${rupiah(efektif.at(-1)!)}.`,
  );
  const tip = buatTip(wadah);
  const svg = wadah.querySelector("svg")!;
  svg.addEventListener("pointermove", (e) => {
    const g = (e.target as Element).closest<SVGGElement>(".kolom");
    if (!g) return tip.sembunyi();
    const i = Number(g.dataset.i);
    const k = svg.getBoundingClientRect();
    tip.tampil(e.clientX - k.left, e.clientY - k.top, `<b>Bulan ke-${i + 1}</b><br>Flat ${rupiah(flat[i])}<br>Efektif ${rupiah(efektif[i])}`);
  });
  svg.addEventListener("pointerleave", () => tip.sembunyi());
}
