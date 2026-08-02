/* DIHASILKAN OLEH `npm run tur` — JANGAN DIEDIT TANGAN. */
import type { LaporanTur } from './bukti-tipe';

export const BUKTI: LaporanTur = {
  "basis": "https://rag.sainskerta.net",
  "pada": "2026-08-02T04:06:59.631Z",
  "masuk": true,
  "mode": "baca+tulis",
  "dibuatLaluDihapus": {
    "chatbotId": "95323550-fd10-4ff5-80f1-acb0807f3d2b"
  },
  "jejakBersih": [
    "DELETE /api/chatbots/95323550-fd10-4ff5-80f1-acb0807f3d2b \"Uji Tur 2026-08-02\" → 200",
    "DELETE /api/chatbots/b732b6cb-c650-4381-bebc-72252a86e9d2 \"Uji Tur 2026-08-02\" → 200"
  ],
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
          "ms": 4413
        },
        {
          "n": 2,
          "nama": "Gulir ke bawah — seluruh halaman termuat",
          "gambar": "landing-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2133
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
          "ms": 1714
        },
        {
          "n": 2,
          "nama": "Tab Daftar — pendaftaran mandiri tersedia",
          "gambar": "auth-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1044
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
          "ms": 1951
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
          "ms": 1824
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
          "ms": 1732
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
          "ms": 1739
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
          "ms": 2693
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
          "ms": 1800
        },
        {
          "n": 2,
          "nama": "Gelembung chat terbuka",
          "gambar": "demo-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2384
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
          "ms": 1159
        },
        {
          "n": 2,
          "nama": "Isi kredensial dan tekan Masuk",
          "gambar": "masuk-02.png",
          "status": "bekerja",
          "catatan": "mendarat di /chat",
          "http": null,
          "galat": [],
          "ms": 3680
        },
        {
          "n": 3,
          "nama": "Sidebar lengkap — menu superadmin ikut tampil",
          "gambar": "masuk-03.png",
          "status": "bekerja",
          "catatan": "Dataroom hanya terlihat oleh superadmin",
          "http": null,
          "galat": [],
          "ms": 2139
        }
      ]
    },
    {
      "id": "dashboard",
      "fitur": "Dashboard",
      "jalur": "/dashboard",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "5 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /dashboard",
          "gambar": "dashboard-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1210
        },
        {
          "n": 2,
          "nama": "Panel: PESAN 30 HARI TERAKHIR",
          "gambar": "dashboard-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1394
        },
        {
          "n": 3,
          "nama": "Panel: PER CHATBOT (30 HARI)",
          "gambar": "dashboard-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1348
        },
        {
          "n": 4,
          "nama": "Panel: CARA KERJA",
          "gambar": "dashboard-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1386
        },
        {
          "n": 5,
          "nama": "Panel: MULAI CEPAT",
          "gambar": "dashboard-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1405
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
          "ms": 1777
        },
        {
          "n": 2,
          "nama": "Buka laci Tambah Chatbot",
          "gambar": "chatbots-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1062
        },
        {
          "n": 3,
          "nama": "Isi nama + konteks, tekan Simpan",
          "gambar": "chatbots-03.png",
          "status": "bekerja",
          "catatan": "POST /api/chatbots → 201 dalam 559ms",
          "http": 201,
          "galat": [],
          "ms": 1541
        },
        {
          "n": 4,
          "nama": "Chatbot baru muncul di daftar",
          "gambar": "chatbots-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2068
        },
        {
          "n": 5,
          "nama": "Buka editor chatbot yang sudah ada",
          "gambar": "chatbots-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1395
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
          "ms": 1814
        },
        {
          "n": 2,
          "nama": "Panel: KNOWLEDGE BASES",
          "gambar": "knowledge-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1398
        },
        {
          "n": 3,
          "nama": "Panel: AKUN STORAGE TERHUBUNG",
          "gambar": "knowledge-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1397
        },
        {
          "n": 4,
          "nama": "Panel: SUMBER DATA ·",
          "gambar": "knowledge-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1354
        },
        {
          "n": 5,
          "nama": "Dropdown knowledge base di header Sumber Data",
          "gambar": "knowledge-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1009
        },
        {
          "n": 6,
          "nama": "Laci Buat KB",
          "gambar": "knowledge-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1344
        },
        {
          "n": 7,
          "nama": "Laci Tambah sumber (Drive/OneDrive/SharePoint/S3)",
          "gambar": "knowledge-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1367
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
          "ms": 1293
        },
        {
          "n": 2,
          "nama": "Kirim pertanyaan dan tunggu jawaban",
          "gambar": "chat-02.png",
          "status": "bekerja",
          "catatan": "jawaban mulai muncul dalam 6180ms",
          "http": null,
          "galat": [],
          "ms": 7118
        },
        {
          "n": 3,
          "nama": "Sesi tercatat di daftar riwayat",
          "gambar": "chat-03.png",
          "status": "bekerja",
          "catatan": "rel daftar sesi di konsol Chat",
          "http": null,
          "galat": [],
          "ms": 2393
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
          "ms": 1813
        }
      ]
    },
    {
      "id": "graf",
      "fitur": "Graf pengetahuan",
      "jalur": "/graf",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "2 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /graf",
          "gambar": "graf-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1773
        },
        {
          "n": 2,
          "nama": "Panel: PETA HUBUNGAN",
          "gambar": "graf-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1331
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
          "ms": 1776
        },
        {
          "n": 2,
          "nama": "Pemilih tenant — hanya ada untuk superadmin",
          "gambar": "conversations-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1659
        },
        {
          "n": 3,
          "nama": "Buka satu sesi percakapan",
          "gambar": "conversations-03.png",
          "status": "bekerja",
          "catatan": "belum ada percakapan untuk dibuka",
          "http": null,
          "galat": [],
          "ms": 1264
        }
      ]
    },
    {
      "id": "analytics",
      "fitur": "Analitik per chatbot",
      "jalur": "/analytics",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "4 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /analytics",
          "gambar": "analytics-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2585
        },
        {
          "n": 2,
          "nama": "Panel: PERTANYAAN TERBANYAK",
          "gambar": "analytics-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1352
        },
        {
          "n": 3,
          "nama": "Panel: TOPIK YANG SERING MUNCUL",
          "gambar": "analytics-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1370
        },
        {
          "n": 4,
          "nama": "Panel: DOKUMEN PALING SERING JADI SUMBER JAWABAN",
          "gambar": "analytics-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1357
        }
      ]
    },
    {
      "id": "memory",
      "fitur": "Memory agent",
      "jalur": "/memory",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "3 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /memory",
          "gambar": "memory-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2107
        },
        {
          "n": 2,
          "nama": "Panel: KNOWLEDGE GRAPH",
          "gambar": "memory-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1352
        },
        {
          "n": 3,
          "nama": "Panel: CATATAN",
          "gambar": "memory-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1342
        }
      ]
    },
    {
      "id": "categories",
      "fitur": "Kategori dokumen",
      "jalur": "/categories",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "2 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /categories",
          "gambar": "categories-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1775
        },
        {
          "n": 2,
          "nama": "Panel: KATEGORI AKTIF",
          "gambar": "categories-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1372
        }
      ]
    },
    {
      "id": "models",
      "fitur": "Models & Keys (+ server LLM/embedding & OAuth apps)",
      "jalur": "/models",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "8 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /models",
          "gambar": "models-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2542
        },
        {
          "n": 2,
          "nama": "Panel: MODEL CHAT AKTIF",
          "gambar": "models-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1367
        },
        {
          "n": 3,
          "nama": "Panel: MODEL EMBEDDING AKTIF",
          "gambar": "models-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1394
        },
        {
          "n": 4,
          "nama": "Panel: SYSTEM PROMPT",
          "gambar": "models-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1365
        },
        {
          "n": 5,
          "nama": "Panel: PROVIDER API KEYS",
          "gambar": "models-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1402
        },
        {
          "n": 6,
          "nama": "Panel: SERVER LLM SENDIRI (ON-PREMISE)",
          "gambar": "models-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1390
        },
        {
          "n": 7,
          "nama": "Panel: SERVER EMBEDDING (VPS)",
          "gambar": "models-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1374
        },
        {
          "n": 8,
          "nama": "Panel: KREDENSIAL OAUTH (GOOGLE / MICROSOFT)",
          "gambar": "models-08.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1399
        }
      ]
    },
    {
      "id": "branding",
      "fitur": "Branding / white-label",
      "jalur": "/branding",
      "butuhLogin": true,
      "status": "sebagian",
      "ringkas": "1 dari 4 langkah bermasalah: Buka /branding",
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
          "ms": 2608
        },
        {
          "n": 2,
          "nama": "Panel: PENGATURAN",
          "gambar": "branding-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1377
        },
        {
          "n": 3,
          "nama": "Panel: PRATINJAU",
          "gambar": "branding-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1379
        },
        {
          "n": 4,
          "nama": "Panel: PASANG DI SITUS",
          "gambar": "branding-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1375
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
          "ms": 2089
        },
        {
          "n": 2,
          "nama": "Panel: ANGGOTA",
          "gambar": "team-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1381
        },
        {
          "n": 3,
          "nama": "Panel: UNDANGAN",
          "gambar": "team-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1367
        },
        {
          "n": 4,
          "nama": "Panel: VERIFIKASI PENDAFTARAN",
          "gambar": "team-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1376
        },
        {
          "n": 5,
          "nama": "Laci undang anggota",
          "gambar": "team-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1839
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
          "ms": 1699
        },
        {
          "n": 2,
          "nama": "Panel: DIVISI AKTIF",
          "gambar": "divisions-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1336
        },
        {
          "n": 3,
          "nama": "Laci buat divisi",
          "gambar": "divisions-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1817
        }
      ]
    },
    {
      "id": "usage",
      "fitur": "Usage & kuota (+ per tenant utk superadmin)",
      "jalur": "/usage",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "4 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /usage",
          "gambar": "usage-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2540
        },
        {
          "n": 2,
          "nama": "Panel: PESAN PER HARI · 30 HARI",
          "gambar": "usage-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1370
        },
        {
          "n": 3,
          "nama": "Panel: PER CHATBOT · 30 HARI",
          "gambar": "usage-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1338
        },
        {
          "n": 4,
          "nama": "Panel: PER TENANT · PERIODE BERJALAN",
          "gambar": "usage-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1346
        }
      ]
    },
    {
      "id": "billing",
      "fitur": "Billing, kuota plan & seluruh tenant",
      "jalur": "/billing",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "11 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /billing",
          "gambar": "billing-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2545
        },
        {
          "n": 2,
          "nama": "Panel: PLAN AKTIF",
          "gambar": "billing-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1372
        },
        {
          "n": 3,
          "nama": "Panel: PAKET TERSEDIA",
          "gambar": "billing-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1367
        },
        {
          "n": 4,
          "nama": "Panel: RIWAYAT PEMBAYARAN",
          "gambar": "billing-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1419
        },
        {
          "n": 5,
          "nama": "Panel: IDENTITAS PENERBIT KUITANSI (SUPERADMIN)",
          "gambar": "billing-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1334
        },
        {
          "n": 6,
          "nama": "Panel: PENGATURAN PEMBAYARAN & MODE DEPLOY (SUPERADMIN)",
          "gambar": "billing-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1393
        },
        {
          "n": 7,
          "nama": "Panel: MIDTRANS",
          "gambar": "billing-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1381
        },
        {
          "n": 8,
          "nama": "Panel: TRIPAY",
          "gambar": "billing-08.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1384
        },
        {
          "n": 9,
          "nama": "Panel: XENDIT",
          "gambar": "billing-09.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1367
        },
        {
          "n": 10,
          "nama": "Panel: KUOTA PAKET",
          "gambar": "billing-10.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1421
        },
        {
          "n": 11,
          "nama": "Panel: SEMUA TENANT",
          "gambar": "billing-11.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1370
        }
      ]
    },
    {
      "id": "observability",
      "fitur": "Observability (superadmin)",
      "jalur": "/observability",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "6 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /observability",
          "gambar": "observability-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2093
        },
        {
          "n": 2,
          "nama": "Panel: KESEHATAN",
          "gambar": "observability-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1378
        },
        {
          "n": 3,
          "nama": "Panel: PEMAKAIAN BULAN 2026-08",
          "gambar": "observability-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1359
        },
        {
          "n": 4,
          "nama": "Panel: AKTIVITAS (24H)",
          "gambar": "observability-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1354
        },
        {
          "n": 5,
          "nama": "Panel: GALAT TERAKHIR",
          "gambar": "observability-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1363
        },
        {
          "n": 6,
          "nama": "Panel: TENANT TERSIBUK",
          "gambar": "observability-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1346
        }
      ]
    },
    {
      "id": "settings",
      "fitur": "Settings (+ SMTP, demo publik, saklar konektor)",
      "jalur": "/settings",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "11 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /settings",
          "gambar": "settings-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1775
        },
        {
          "n": 2,
          "nama": "Panel: TAMPILAN",
          "gambar": "settings-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1383
        },
        {
          "n": 3,
          "nama": "Panel: WHITE-LABEL",
          "gambar": "settings-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1394
        },
        {
          "n": 4,
          "nama": "Panel: DEPLOYMENT",
          "gambar": "settings-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1392
        },
        {
          "n": 5,
          "nama": "Panel: API KEY",
          "gambar": "settings-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1395
        },
        {
          "n": 6,
          "nama": "Panel: WEBHOOK KELUAR",
          "gambar": "settings-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1377
        },
        {
          "n": 7,
          "nama": "Panel: DUA FAKTOR (TOTP)",
          "gambar": "settings-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1392
        },
        {
          "n": 8,
          "nama": "Panel: SSO ORGANISASI",
          "gambar": "settings-08.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1389
        },
        {
          "n": 9,
          "nama": "Panel: KONEKTOR SUMBER DATA (SUPERADMIN)",
          "gambar": "settings-09.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1384
        },
        {
          "n": 10,
          "nama": "Panel: DEMO PUBLIK DI LANDING (SUPERADMIN)",
          "gambar": "settings-10.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1378
        },
        {
          "n": 11,
          "nama": "Panel: EMAIL PLATFORM / SMTP (SUPERADMIN)",
          "gambar": "settings-11.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1395
        }
      ]
    },
    {
      "id": "bantuan",
      "fitur": "Panduan pengguna",
      "jalur": "/bantuan",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "9 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /bantuan",
          "gambar": "bantuan-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1817
        },
        {
          "n": 2,
          "nama": "Panel: 1 · EMPAT LANGKAH PERTAMA",
          "gambar": "bantuan-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1391
        },
        {
          "n": 3,
          "nama": "Panel: 2 · DOKUMEN: FORMAT & YANG TAK TERBACA",
          "gambar": "bantuan-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1385
        },
        {
          "n": 4,
          "nama": "Panel: 3 · KENAPA BOT MENJAWAB \"TIDAK ADA DI DOKUMEN\"",
          "gambar": "bantuan-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1374
        },
        {
          "n": 5,
          "nama": "Panel: 4 · MEMASANG DI SITUSMU",
          "gambar": "bantuan-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1431
        },
        {
          "n": 6,
          "nama": "Panel: 5 · KUOTA, DAN APA YANG TERJADI SAAT HABIS",
          "gambar": "bantuan-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1378
        },
        {
          "n": 7,
          "nama": "Panel: 6 · KEAMANAN DATA",
          "gambar": "bantuan-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1384
        },
        {
          "n": 8,
          "nama": "Panel: BATAS PER PAKET",
          "gambar": "bantuan-08.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1360
        },
        {
          "n": 9,
          "nama": "Panel: MASIH TERSANGKUT?",
          "gambar": "bantuan-09.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1387
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
          "ms": 2579
        }
      ]
    },
    {
      "id": "dataroom",
      "fitur": "Dataroom (superadmin)",
      "jalur": "/dataroom",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "9 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka Dataroom",
          "gambar": "dataroom-01.png",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1802
        },
        {
          "n": 2,
          "nama": "Tab: HLA",
          "gambar": "dataroom-02.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2281
        },
        {
          "n": 3,
          "nama": "Tab: Technical",
          "gambar": "dataroom-03.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2185
        },
        {
          "n": 4,
          "nama": "Tab: Business",
          "gambar": "dataroom-04.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2160
        },
        {
          "n": 5,
          "nama": "Tab: Proposal",
          "gambar": "dataroom-05.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2192
        },
        {
          "n": 6,
          "nama": "Tab: Assessment",
          "gambar": "dataroom-06.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2286
        },
        {
          "n": 7,
          "nama": "Tab: Bukti Fitur",
          "gambar": "dataroom-07.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2333
        },
        {
          "n": 8,
          "nama": "Tab: Kalkulator",
          "gambar": "dataroom-08.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2228
        },
        {
          "n": 9,
          "nama": "Tab: Backlog",
          "gambar": "dataroom-09.png",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2306
        }
      ]
    }
  ]
};
