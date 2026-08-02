/* DIHASILKAN OLEH `npm run tur` — JANGAN DIEDIT TANGAN. */
import type { LaporanTur } from './bukti-tipe';

export const BUKTI: LaporanTur = {
  "basis": "https://rag.sainskerta.net",
  "pada": "2026-08-02T05:01:32.020Z",
  "masuk": true,
  "mode": "baca+tulis",
  "dibuatLaluDihapus": {
    "chatbotId": "cfea41a8-24bc-4ee8-99a0-bac91d92d3ab"
  },
  "jejakBersih": [
    "DELETE /api/chatbots/cfea41a8-24bc-4ee8-99a0-bac91d92d3ab \"Uji Tur 2026-08-02\" → 200"
  ],
  "ringkas": {
    "total": 30,
    "bekerja": 30,
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
          "gambar": "landing-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 3381
        },
        {
          "n": 2,
          "nama": "Gulir ke bawah — seluruh halaman termuat",
          "gambar": "landing-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2482
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
          "gambar": "auth-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1417
        },
        {
          "n": 2,
          "nama": "Tab Daftar — pendaftaran mandiri tersedia",
          "gambar": "auth-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1210
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
          "gambar": "reset-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1336
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
          "gambar": "status-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1388
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
          "gambar": "privacy-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1516
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
          "gambar": "terms-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1403
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
          "gambar": "widget-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2438
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
          "gambar": "demo-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1829
        },
        {
          "n": 2,
          "nama": "Gelembung chat terbuka",
          "gambar": "demo-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2577
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
          "gambar": "masuk-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1400
        },
        {
          "n": 2,
          "nama": "Isi kredensial dan tekan Masuk",
          "gambar": "masuk-02.webp",
          "status": "bekerja",
          "catatan": "mendarat di /chat",
          "http": null,
          "galat": [],
          "ms": 3574
        },
        {
          "n": 3,
          "nama": "Sidebar lengkap — menu superadmin ikut tampil",
          "gambar": "masuk-03.webp",
          "status": "bekerja",
          "catatan": "Dataroom hanya terlihat oleh superadmin",
          "http": null,
          "galat": [],
          "ms": 7103
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
          "gambar": "dashboard-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1529
        },
        {
          "n": 2,
          "nama": "Panel: PESAN 30 HARI TERAKHIR",
          "gambar": "dashboard-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1659
        },
        {
          "n": 3,
          "nama": "Panel: PER CHATBOT (30 HARI)",
          "gambar": "dashboard-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1662
        },
        {
          "n": 4,
          "nama": "Panel: CARA KERJA",
          "gambar": "dashboard-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1709
        },
        {
          "n": 5,
          "nama": "Panel: MULAI CEPAT",
          "gambar": "dashboard-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1669
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
          "gambar": "chatbots-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1440
        },
        {
          "n": 2,
          "nama": "Buka laci Tambah Chatbot",
          "gambar": "chatbots-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1284
        },
        {
          "n": 3,
          "nama": "Isi nama + konteks, tekan Simpan",
          "gambar": "chatbots-03.webp",
          "status": "bekerja",
          "catatan": "POST /api/chatbots → 201 dalam 463ms",
          "http": 201,
          "galat": [],
          "ms": 1679
        },
        {
          "n": 4,
          "nama": "Chatbot baru muncul di daftar",
          "gambar": "chatbots-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2159
        },
        {
          "n": 5,
          "nama": "Buka editor chatbot yang sudah ada",
          "gambar": "chatbots-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1665
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
          "gambar": "knowledge-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1604
        },
        {
          "n": 2,
          "nama": "Panel: KNOWLEDGE BASES",
          "gambar": "knowledge-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1687
        },
        {
          "n": 3,
          "nama": "Panel: AKUN STORAGE TERHUBUNG",
          "gambar": "knowledge-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1694
        },
        {
          "n": 4,
          "nama": "Panel: SUMBER DATA ·",
          "gambar": "knowledge-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1678
        },
        {
          "n": 5,
          "nama": "Dropdown knowledge base di header Sumber Data",
          "gambar": "knowledge-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1337
        },
        {
          "n": 6,
          "nama": "Laci Buat KB",
          "gambar": "knowledge-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1564
        },
        {
          "n": 7,
          "nama": "Laci Tambah sumber (Drive/OneDrive/SharePoint/S3)",
          "gambar": "knowledge-07.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1714
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
          "gambar": "chat-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1397
        },
        {
          "n": 2,
          "nama": "Kirim pertanyaan dan tunggu jawaban",
          "gambar": "chat-02.webp",
          "status": "bekerja",
          "catatan": "jawaban mulai muncul dalam 6169ms",
          "http": null,
          "galat": [],
          "ms": 7383
        },
        {
          "n": 3,
          "nama": "Sesi tercatat di daftar riwayat",
          "gambar": "chat-03.webp",
          "status": "bekerja",
          "catatan": "rel daftar sesi di konsol Chat",
          "http": null,
          "galat": [],
          "ms": 2643
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
          "gambar": "documents-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1462
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
          "gambar": "graf-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1372
        },
        {
          "n": 2,
          "nama": "Panel: PETA HUBUNGAN",
          "gambar": "graf-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1565
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
          "gambar": "conversations-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1499
        },
        {
          "n": 2,
          "nama": "Pemilih tenant — hanya ada untuk superadmin",
          "gambar": "conversations-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1905
        },
        {
          "n": 3,
          "nama": "Buka satu sesi percakapan",
          "gambar": "conversations-03.webp",
          "status": "bekerja",
          "catatan": "belum ada percakapan untuk dibuka",
          "http": null,
          "galat": [],
          "ms": 1534
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
          "gambar": "analytics-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2256
        },
        {
          "n": 2,
          "nama": "Panel: PERTANYAAN TERBANYAK",
          "gambar": "analytics-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1591
        },
        {
          "n": 3,
          "nama": "Panel: TOPIK YANG SERING MUNCUL",
          "gambar": "analytics-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1580
        },
        {
          "n": 4,
          "nama": "Panel: DOKUMEN PALING SERING JADI SUMBER JAWABAN",
          "gambar": "analytics-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1595
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
          "gambar": "memory-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2159
        },
        {
          "n": 2,
          "nama": "Panel: KNOWLEDGE GRAPH",
          "gambar": "memory-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1507
        },
        {
          "n": 3,
          "nama": "Panel: CATATAN",
          "gambar": "memory-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1555
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
          "gambar": "categories-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1431
        },
        {
          "n": 2,
          "nama": "Panel: KATEGORI AKTIF",
          "gambar": "categories-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1596
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
          "gambar": "models-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2280
        },
        {
          "n": 2,
          "nama": "Panel: MODEL CHAT AKTIF",
          "gambar": "models-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1666
        },
        {
          "n": 3,
          "nama": "Panel: MODEL EMBEDDING AKTIF",
          "gambar": "models-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1648
        },
        {
          "n": 4,
          "nama": "Panel: SYSTEM PROMPT",
          "gambar": "models-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1655
        },
        {
          "n": 5,
          "nama": "Panel: PROVIDER API KEYS",
          "gambar": "models-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1586
        },
        {
          "n": 6,
          "nama": "Panel: SERVER LLM SENDIRI (ON-PREMISE)",
          "gambar": "models-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1643
        },
        {
          "n": 7,
          "nama": "Panel: SERVER EMBEDDING (VPS)",
          "gambar": "models-07.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1595
        },
        {
          "n": 8,
          "nama": "Panel: KREDENSIAL OAUTH (GOOGLE / MICROSOFT)",
          "gambar": "models-08.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1725
        }
      ]
    },
    {
      "id": "branding",
      "fitur": "Branding / white-label",
      "jalur": "/branding",
      "butuhLogin": true,
      "status": "bekerja",
      "ringkas": "4 langkah, semuanya bekerja",
      "langkah": [
        {
          "n": 1,
          "nama": "Buka /branding",
          "gambar": "branding-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2367
        },
        {
          "n": 2,
          "nama": "Panel: PENGATURAN",
          "gambar": "branding-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1704
        },
        {
          "n": 3,
          "nama": "Panel: PRATINJAU",
          "gambar": "branding-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1700
        },
        {
          "n": 4,
          "nama": "Panel: PASANG DI SITUS",
          "gambar": "branding-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1710
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
          "gambar": "team-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1719
        },
        {
          "n": 2,
          "nama": "Panel: ANGGOTA",
          "gambar": "team-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1600
        },
        {
          "n": 3,
          "nama": "Panel: UNDANGAN",
          "gambar": "team-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1660
        },
        {
          "n": 4,
          "nama": "Panel: VERIFIKASI PENDAFTARAN",
          "gambar": "team-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1684
        },
        {
          "n": 5,
          "nama": "Laci undang anggota",
          "gambar": "team-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2082
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
          "gambar": "divisions-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1409
        },
        {
          "n": 2,
          "nama": "Panel: DIVISI AKTIF",
          "gambar": "divisions-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1556
        },
        {
          "n": 3,
          "nama": "Laci buat divisi",
          "gambar": "divisions-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2028
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
          "gambar": "usage-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1750
        },
        {
          "n": 2,
          "nama": "Panel: PESAN PER HARI · 30 HARI",
          "gambar": "usage-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1612
        },
        {
          "n": 3,
          "nama": "Panel: PER CHATBOT · 30 HARI",
          "gambar": "usage-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1584
        },
        {
          "n": 4,
          "nama": "Panel: PER TENANT · PERIODE BERJALAN",
          "gambar": "usage-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1556
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
          "gambar": "billing-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1841
        },
        {
          "n": 2,
          "nama": "Panel: PLAN AKTIF",
          "gambar": "billing-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1613
        },
        {
          "n": 3,
          "nama": "Panel: PAKET TERSEDIA",
          "gambar": "billing-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1562
        },
        {
          "n": 4,
          "nama": "Panel: RIWAYAT PEMBAYARAN",
          "gambar": "billing-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1554
        },
        {
          "n": 5,
          "nama": "Panel: IDENTITAS PENERBIT KUITANSI (SUPERADMIN)",
          "gambar": "billing-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1612
        },
        {
          "n": 6,
          "nama": "Panel: PENGATURAN PEMBAYARAN & MODE DEPLOY (SUPERADMIN)",
          "gambar": "billing-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1668
        },
        {
          "n": 7,
          "nama": "Panel: MIDTRANS",
          "gambar": "billing-07.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1629
        },
        {
          "n": 8,
          "nama": "Panel: TRIPAY",
          "gambar": "billing-08.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1648
        },
        {
          "n": 9,
          "nama": "Panel: XENDIT",
          "gambar": "billing-09.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1673
        },
        {
          "n": 10,
          "nama": "Panel: KUOTA PAKET",
          "gambar": "billing-10.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1712
        },
        {
          "n": 11,
          "nama": "Panel: SEMUA TENANT",
          "gambar": "billing-11.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1610
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
          "gambar": "observability-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 2250
        },
        {
          "n": 2,
          "nama": "Panel: KESEHATAN",
          "gambar": "observability-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1613
        },
        {
          "n": 3,
          "nama": "Panel: PEMAKAIAN BULAN 2026-08",
          "gambar": "observability-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1629
        },
        {
          "n": 4,
          "nama": "Panel: AKTIVITAS (24H)",
          "gambar": "observability-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1595
        },
        {
          "n": 5,
          "nama": "Panel: GALAT TERAKHIR",
          "gambar": "observability-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1606
        },
        {
          "n": 6,
          "nama": "Panel: TENANT TERSIBUK",
          "gambar": "observability-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1573
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
          "gambar": "settings-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1488
        },
        {
          "n": 2,
          "nama": "Panel: TAMPILAN",
          "gambar": "settings-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1691
        },
        {
          "n": 3,
          "nama": "Panel: WHITE-LABEL",
          "gambar": "settings-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1617
        },
        {
          "n": 4,
          "nama": "Panel: DEPLOYMENT",
          "gambar": "settings-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1617
        },
        {
          "n": 5,
          "nama": "Panel: API KEY",
          "gambar": "settings-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1622
        },
        {
          "n": 6,
          "nama": "Panel: WEBHOOK KELUAR",
          "gambar": "settings-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1628
        },
        {
          "n": 7,
          "nama": "Panel: DUA FAKTOR (TOTP)",
          "gambar": "settings-07.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1667
        },
        {
          "n": 8,
          "nama": "Panel: SSO ORGANISASI",
          "gambar": "settings-08.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1611
        },
        {
          "n": 9,
          "nama": "Panel: KONEKTOR SUMBER DATA (SUPERADMIN)",
          "gambar": "settings-09.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1645
        },
        {
          "n": 10,
          "nama": "Panel: DEMO PUBLIK DI LANDING (SUPERADMIN)",
          "gambar": "settings-10.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1653
        },
        {
          "n": 11,
          "nama": "Panel: EMAIL PLATFORM / SMTP (SUPERADMIN)",
          "gambar": "settings-11.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1656
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
          "gambar": "bantuan-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1638
        },
        {
          "n": 2,
          "nama": "Panel: 1 · EMPAT LANGKAH PERTAMA",
          "gambar": "bantuan-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1711
        },
        {
          "n": 3,
          "nama": "Panel: 2 · DOKUMEN: FORMAT & YANG TAK TERBACA",
          "gambar": "bantuan-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1748
        },
        {
          "n": 4,
          "nama": "Panel: 3 · KENAPA BOT MENJAWAB \"TIDAK ADA DI DOKUMEN\"",
          "gambar": "bantuan-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1684
        },
        {
          "n": 5,
          "nama": "Panel: 4 · MEMASANG DI SITUSMU",
          "gambar": "bantuan-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1669
        },
        {
          "n": 6,
          "nama": "Panel: 5 · KUOTA, DAN APA YANG TERJADI SAAT HABIS",
          "gambar": "bantuan-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1657
        },
        {
          "n": 7,
          "nama": "Panel: 6 · KEAMANAN DATA",
          "gambar": "bantuan-07.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1664
        },
        {
          "n": 8,
          "nama": "Panel: BATAS PER PAKET",
          "gambar": "bantuan-08.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1749
        },
        {
          "n": 9,
          "nama": "Panel: MASIH TERSANGKUT?",
          "gambar": "bantuan-09.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 1679
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
          "gambar": "welcome-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1860
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
          "gambar": "dataroom-01.webp",
          "status": "bekerja",
          "catatan": "",
          "http": 200,
          "galat": [],
          "ms": 1500
        },
        {
          "n": 2,
          "nama": "Tab: HLA",
          "gambar": "dataroom-02.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2496
        },
        {
          "n": 3,
          "nama": "Tab: Technical",
          "gambar": "dataroom-03.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2407
        },
        {
          "n": 4,
          "nama": "Tab: Business",
          "gambar": "dataroom-04.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2385
        },
        {
          "n": 5,
          "nama": "Tab: Proposal",
          "gambar": "dataroom-05.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2370
        },
        {
          "n": 6,
          "nama": "Tab: Assessment",
          "gambar": "dataroom-06.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2590
        },
        {
          "n": 7,
          "nama": "Tab: Bukti Fitur",
          "gambar": "dataroom-07.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2546
        },
        {
          "n": 8,
          "nama": "Tab: Kalkulator",
          "gambar": "dataroom-08.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2512
        },
        {
          "n": 9,
          "nama": "Tab: Backlog",
          "gambar": "dataroom-09.webp",
          "status": "bekerja",
          "catatan": "",
          "http": null,
          "galat": [],
          "ms": 2632
        }
      ]
    }
  ]
};
