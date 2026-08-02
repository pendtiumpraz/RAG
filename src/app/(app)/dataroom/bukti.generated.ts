/* DIHASILKAN OLEH `npm run tur` — JANGAN DIEDIT TANGAN. */
import type { LaporanTur } from './bukti-tipe';

export const BUKTI: LaporanTur = {
  "basis": "https://rag.sainskerta.net",
  "pada": "2026-08-02T03:39:35.002Z",
  "masuk": true,
  "mode": "baca+tulis",
  "dibuatLaluDihapus": {},
  "jejakBersih": [],
  "ringkas": {
    "total": 30,
    "bekerja": 29,
    "sebagian": 1,
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
          "ms": 2212
        },
        {
          "n": 2,
          "nama": "Gulir ke bawah — seluruh halaman termuat",
          "gambar": "landing-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2054
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
          "ms": 1474
        },
        {
          "n": 2,
          "nama": "Tab Daftar — pendaftaran mandiri tersedia",
          "gambar": "auth-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 847
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
          "ms": 1800
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
          "ms": 1514
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
          "ms": 1604
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
          "ms": 1771
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
          "ms": 2520
        }
      ]
    },
    {
      "id": "demo",
      "fitur": "Demo publik tanpa daftar",
      "jalur": "/demo/cb_live_uey9JkjAO7CROr_UNEVqMhUK",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "2 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka halaman demo",
          "gambar": "demo-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1425
        },
        {
          "n": 2,
          "nama": "Gelembung chat terbuka",
          "gambar": "demo-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2398
        }
      ]
    },
    {
      "id": "masuk",
      "fitur": "Autentikasi — masuk dengan kredensial",
      "jalur": "/auth",
      "butuhLogin": false,
      "status": "bekerja",
      "ringkas": "3 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka formulir masuk",
          "gambar": "masuk-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1145
        },
        {
          "n": 2,
          "nama": "Isi kredensial dan tekan Masuk",
          "gambar": "masuk-02.png",
          "status": "bekerja",
          "catatan": "mendarat di /chat",
          "http": null,
          "galat": [],
          "ms": 3521
        },
        {
          "n": 3,
          "nama": "Sidebar lengkap — menu superadmin ikut tampil",
          "gambar": "masuk-03.png",
          "status": "bekerja",
          "catatan": "Dataroom hanya terlihat oleh superadmin",
          "http": null,
          "galat": [],
          "ms": 2563
        }
      ]
    },
    {
      "id": "dashboard",
      "fitur": "Dashboard",
      "jalur": "/dashboard",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /dashboard",
          "gambar": "dashboard-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1216
        }
      ]
    },
    {
      "id": "chatbots",
      "fitur": "Chatbots — daftar, tambah, embed",
      "jalur": "/chatbots",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "5 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Daftar chatbot",
          "gambar": "chatbots-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1252
        },
        {
          "n": 2,
          "nama": "Buka laci Tambah Chatbot",
          "gambar": "chatbots-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1060
        },
        {
          "n": 3,
          "nama": "Isi nama + konteks, tekan Simpan",
          "gambar": "chatbots-03.png",
          "status": "bekerja",
          "catatan": "POST /api/chatbots → 201 dalam 528ms",
          "http": 201,
          "galat": [],
          "ms": 1525
        },
        {
          "n": 4,
          "nama": "Chatbot baru muncul di daftar",
          "gambar": "chatbots-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2030
        },
        {
          "n": 5,
          "nama": "Buka editor chatbot yang sudah ada",
          "gambar": "chatbots-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1408
        }
      ]
    },
    {
      "id": "knowledge",
      "fitur": "Knowledge Base & sumber data",
      "jalur": "/knowledge",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "7 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Halaman Knowledge Base",
          "gambar": "knowledge-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1791
        },
        {
          "n": 2,
          "nama": "Panel: KNOWLEDGE BASES",
          "gambar": "knowledge-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1377
        },
        {
          "n": 3,
          "nama": "Panel: AKUN STORAGE TERHUBUNG",
          "gambar": "knowledge-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1385
        },
        {
          "n": 4,
          "nama": "Panel: SUMBER DATA ·",
          "gambar": "knowledge-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1376
        },
        {
          "n": 5,
          "nama": "Dropdown knowledge base di header Sumber Data",
          "gambar": "knowledge-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1002
        },
        {
          "n": 6,
          "nama": "Laci Buat KB",
          "gambar": "knowledge-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1351
        },
        {
          "n": 7,
          "nama": "Laci Tambah sumber (Drive/OneDrive/SharePoint/S3)",
          "gambar": "knowledge-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1369
        }
      ]
    },
    {
      "id": "chat",
      "fitur": "Chat — tanya jawab berdasar dokumen",
      "jalur": "/chat",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "3 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Konsol chat",
          "gambar": "chat-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1241
        },
        {
          "n": 2,
          "nama": "Kirim pertanyaan dan tunggu jawaban",
          "gambar": "chat-02.png",
          "status": "bekerja",
          "catatan": "jawaban mulai muncul dalam 6185ms",
          "http": null,
          "galat": [],
          "ms": 7128
        },
        {
          "n": 3,
          "nama": "Sesi tercatat di daftar riwayat",
          "gambar": "chat-03.png",
          "status": "bekerja",
          "catatan": "rel daftar sesi di konsol Chat",
          "http": null,
          "galat": [],
          "ms": 2438
        }
      ]
    },
    {
      "id": "documents",
      "fitur": "Dokumen — pencarian & pratinjau",
      "jalur": "/documents",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /documents",
          "gambar": "documents-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1790
        }
      ]
    },
    {
      "id": "graf",
      "fitur": "Graf pengetahuan",
      "jalur": "/graf",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /graf",
          "gambar": "graf-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1753
        }
      ]
    },
    {
      "id": "conversations",
      "fitur": "Conversations (lintas tenant utk superadmin)",
      "jalur": "/conversations",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "3 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Daftar percakapan",
          "gambar": "conversations-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1768
        },
        {
          "n": 2,
          "nama": "Pemilih tenant — hanya ada untuk superadmin",
          "gambar": "conversations-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1634
        },
        {
          "n": 3,
          "nama": "Buka satu sesi percakapan",
          "gambar": "conversations-03.png",
          "status": "bekerja",
          "catatan": "belum ada percakapan untuk dibuka",
          "http": null,
          "galat": [],
          "ms": 1230
        }
      ]
    },
    {
      "id": "analytics",
      "fitur": "Analitik per chatbot",
      "jalur": "/analytics",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /analytics",
          "gambar": "analytics-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2580
        }
      ]
    },
    {
      "id": "memory",
      "fitur": "Memory agent",
      "jalur": "/memory",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /memory",
          "gambar": "memory-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2071
        }
      ]
    },
    {
      "id": "categories",
      "fitur": "Kategori dokumen",
      "jalur": "/categories",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /categories",
          "gambar": "categories-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1781
        }
      ]
    },
    {
      "id": "models",
      "fitur": "Models & Keys (+ server LLM/embedding & OAuth apps)",
      "jalur": "/models",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /models",
          "gambar": "models-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2583
        }
      ]
    },
    {
      "id": "branding",
      "fitur": "Branding / white-label",
      "jalur": "/branding",
      "butuhLogin": true,
      "status": "sebagian",
      "ringkas": "1 dari 1 langkah bermasalah: Buka /branding",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /branding",
          "gambar": "branding-01.png",
          "status": "sebagian",
          "catatan": "",
          "http": 200,
          "galat": [
            "konsol: Failed to load resource: the server responded with a status of 404 ()"
          ],
          "ms": 2585
        }
      ]
    },
    {
      "id": "team",
      "fitur": "Team, RBAC & antrean persetujuan",
      "jalur": "/team",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "5 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Halaman Team",
          "gambar": "team-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2095
        },
        {
          "n": 2,
          "nama": "Panel: ANGGOTA",
          "gambar": "team-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1380
        },
        {
          "n": 3,
          "nama": "Panel: UNDANGAN",
          "gambar": "team-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1391
        },
        {
          "n": 4,
          "nama": "Panel: VERIFIKASI PENDAFTARAN",
          "gambar": "team-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1391
        },
        {
          "n": 5,
          "nama": "Laci undang anggota",
          "gambar": "team-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1855
        }
      ]
    },
    {
      "id": "divisions",
      "fitur": "Divisi",
      "jalur": "/divisions",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "3 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Halaman Divisi",
          "gambar": "divisions-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1758
        },
        {
          "n": 2,
          "nama": "Panel: DIVISI AKTIF",
          "gambar": "divisions-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1331
        },
        {
          "n": 3,
          "nama": "Laci buat divisi",
          "gambar": "divisions-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1840
        }
      ]
    },
    {
      "id": "usage",
      "fitur": "Usage & kuota (+ per tenant utk superadmin)",
      "jalur": "/usage",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /usage",
          "gambar": "usage-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2073
        }
      ]
    },
    {
      "id": "billing",
      "fitur": "Billing, kuota plan & seluruh tenant",
      "jalur": "/billing",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /billing",
          "gambar": "billing-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2134
        }
      ]
    },
    {
      "id": "observability",
      "fitur": "Observability (superadmin)",
      "jalur": "/observability",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /observability",
          "gambar": "observability-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2107
        }
      ]
    },
    {
      "id": "settings",
      "fitur": "Settings (+ SMTP, demo publik, saklar konektor)",
      "jalur": "/settings",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /settings",
          "gambar": "settings-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1822
        }
      ]
    },
    {
      "id": "bantuan",
      "fitur": "Panduan pengguna",
      "jalur": "/bantuan",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /bantuan",
          "gambar": "bantuan-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1827
        }
      ]
    },
    {
      "id": "welcome",
      "fitur": "Layar pilih paket",
      "jalur": "/welcome",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /welcome",
          "gambar": "welcome-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2599
        }
      ]
    },
    {
      "id": "dataroom",
      "fitur": "Dataroom (superadmin)",
      "jalur": "/dataroom",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "1 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka Dataroom",
          "gambar": "dataroom-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1288
        }
      ]
    }
  ]
};
