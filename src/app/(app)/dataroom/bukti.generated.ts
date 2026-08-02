/* DIHASILKAN OLEH `npm run tur` — JANGAN DIEDIT TANGAN. */
import type { LaporanTur } from './bukti-tipe';

export const BUKTI: LaporanTur = {
  "basis": "https://rag.sainskerta.net",
  "pada": "2026-08-02T02:22:32.673Z",
  "masuk": false,
  "mode": "baca saja",
  "dibuatLaluDihapus": {},
  "jejakBersih": [],
  "ringkas": {
    "total": 8,
    "bekerja": 8,
    "sebagian": 0,
    "gagal": 0,
    "dilewati": 0
  },
  "adegan": [
    {
      "id": "landing",
      "fitur": "Landing publik",
      "jalur": "/",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "2 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka halaman depan",
          "gambar": "landing-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1449
        },
        {
          "n": 2,
          "nama": "Gulir ke bawah — seluruh halaman termuat",
          "gambar": "landing-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2101
        }
      ]
    },
    {
      "id": "auth",
      "fitur": "Masuk & daftar",
      "jalur": "/auth",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "2 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Formulir masuk",
          "gambar": "auth-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1233
        },
        {
          "n": 2,
          "nama": "Tab Daftar — pendaftaran mandiri tersedia",
          "gambar": "auth-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1013
        }
      ]
    },
    {
      "id": "reset",
      "fitur": "Lupa password",
      "jalur": "/auth/reset",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /auth/reset",
          "gambar": "reset-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1138
        }
      ]
    },
    {
      "id": "status",
      "fitur": "Halaman status",
      "jalur": "/status",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /status",
          "gambar": "status-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1157
        }
      ]
    },
    {
      "id": "privacy",
      "fitur": "Kebijakan privasi",
      "jalur": "/privacy",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /privacy",
          "gambar": "privacy-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1283
        }
      ]
    },
    {
      "id": "terms",
      "fitur": "Syarat layanan",
      "jalur": "/terms",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /terms",
          "gambar": "terms-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1266
        }
      ]
    },
    {
      "id": "widget",
      "fitur": "Widget embed (pengunjung)",
      "jalur": "/c/cb_live_uey9JkjAO7CROr_UNEVqMhUK",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka jendela chat publik",
          "gambar": "widget-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1801
        }
      ]
    },
    {
      "id": "demo",
      "fitur": "Demo publik tanpa daftar",
      "jalur": "/demo/cb_live_uey9JkjAO7CROr_UNEVqMhUK",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka halaman demo",
          "gambar": "demo-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1482
        }
      ]
    }
  ]
};
