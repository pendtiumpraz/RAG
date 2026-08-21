/**
 * PDF BOOTSTRAP — polyfill web API untuk pdf-parse (pdf.js) di runtime server.
 *
 * pdf-parse v2 (pdfjs-dist 5.x) memakai web API `DOMMatrix`, `Path2D`, dan
 * `ImageData` yang TIDAK ada di runtime Node serverless (Vercel). Ia mencoba
 * polyfill sendiri dari package `@napi-rs/canvas`, tetapi native binding
 * canvas tidak tersedia di lingkungan Vercel/sandbox (muncul warning
 * "Cannot load @napi-rs/canvas"), sehingga `new DOMMatrix()` gagal dengan
 * `ReferenceError: DOMMatrix is not defined` dan PDF valid tercatat sebagai
 * skipped.
 *
 * Solusi: sediakan polyfill murni-JS ringan SEBELUM pdf-parse dijalankan.
 * Implementasi di bawah hanya cukup untuk jalur EKSTRAKSI TEKS (getText /
 * getTextContent), bukan rendering penuh — itu sudah memenuhi kebutuhan
 * knowledge sync. Dipasang idempoten (hanya kalau belum ada di globalThis).
 */

let _terpasang = false;

/** Pasang polyfill DOMMatrix/Path2D/ImageData bila globalThis belum punya. */
export function pastikanPolyfillPdf(): void {
  if (_terpasang) return;
  const g = globalThis as any;

  /* ---- DOMMatrix (subset untuk transformasi matriks 2D pdf.js) ---- */
  if (!g.DOMMatrix) {
    class DOMMatrix {
      a: number; b: number; c: number; d: number; e: number; f: number;
      constructor(init?: any) {
        if (Array.isArray(init)) {
          this.a = init[0] ?? 1; this.b = init[1] ?? 0;
          this.c = init[2] ?? 0; this.d = init[3] ?? 1;
          this.e = init[4] ?? 0; this.f = init[5] ?? 0;
        } else {
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        }
      }
      get is2D() { return true; }
      get m11() { return this.a; } set m11(v: number) { this.a = v; }
      get m12() { return this.b; } set m12(v: number) { this.b = v; }
      get m21() { return this.c; } set m21(v: number) { this.c = v; }
      get m22() { return this.d; } set m22(v: number) { this.d = v; }
      get m41() { return this.e; } set m41(v: number) { this.e = v; }
      get m42() { return this.f; } set m42(v: number) { this.f = v; }
      preMultiplySelf(o: any) {
        const { a: A, b: B, c: C, d: D, e: E, f: F } = this;
        const { a, b, c, d, e, f } = o;
        this.a = a * A + c * B; this.b = b * A + d * B;
        this.c = a * C + c * D; this.d = b * C + d * D;
        this.e = a * E + c * F + e; this.f = b * E + d * F + f;
        return this;
      }
      multiplySelf(o: any) {
        const { a: A, b: B, c: C, d: D, e: E, f: F } = this;
        const { a, b, c, d, e, f } = o;
        this.a = A * a + C * b; this.b = B * a + D * b;
        this.c = A * c + C * d; this.d = B * c + D * d;
        this.e = A * e + C * f + E; this.f = B * e + D * f + F;
        return this;
      }
      scale(sx: number, sy?: number) {
        const s = sy ?? sx; this.multiplySelf({ a: sx, b: 0, c: 0, d: s, e: 0, f: 0 }); return this;
      }
      translate(tx: number, ty: number) {
        this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }); return this;
      }
      invertSelf() {
        const { a, b, c, d, e, f } = this; const det = a * d - b * c;
        if (!det) return this;
        const na = d / det, nb = -b / det, nc = -c / det, nd = a / det;
        const ne = (c * f - d * e) / det, nf = (b * e - a * f) / det;
        this.a = na; this.b = nb; this.c = nc; this.d = nd; this.e = ne; this.f = nf;
        return this;
      }
      getTransform() {
        return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f };
      }
    }
    g.DOMMatrix = DOMMatrix;
  }

  /* ---- Path2D (pdf.js menyimpannya dan memakainya untuk clip) ---- */
  if (!g.Path2D) {
    class Path2D {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      rect() {}
      ellipse() {}
    }
    g.Path2D = Path2D;
  }

  /* ---- ImageData (pdf.js untuk buffer piksel) ---- */
  if (!g.ImageData) {
    class ImageData {
      width: number; height: number; data: Uint8ClampedArray;
      constructor(width: number, height: number) {
        this.width = width; this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    }
    g.ImageData = ImageData;
  }

  _terpasang = true;
}
