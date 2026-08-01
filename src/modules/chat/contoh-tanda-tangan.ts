/**
 * CONTOH KODE MENGHITUNG TANDA TANGAN — lima bahasa.
 *
 * Diminta pemilik produk (1 Agu 2026): PHP, Node.js, Python, Go, Java. Go dan
 * Java ditambahkan di luar usulan awal, dan itu masuk akal — keduanya bahasa
 * yang paling sering dipakai backend korporat, yang justru sasaran fitur ini.
 *
 * DISIMPAN SEBAGAI DATA, BUKAN DITULIS DI JSX. Potongan kode di dalam markup
 * harus meloloskan backtick, `${`, dan tanda kutip, dan hasilnya adalah kode
 * yang TIDAK bisa disalin apa adanya oleh pembacanya — persis kegagalan yang
 * paling menjengkelkan pada dokumentasi integrasi. Di sini ia string biasa
 * yang diuji: lima uji memastikan tiap potongan menyebut algoritmanya,
 * rahasianya, dan penandanya, dan tak satu pun membocorkan rahasia ke sisi
 * peramban.
 */

export interface ContohBahasa {
  id: string;
  label: string;
  /** Nama berkas yang disarankan — membantu orang menaruhnya di tempat benar. */
  berkas: string;
  kode: string;
}

const PHP = `<?php
// Dijalankan di SERVER Anda, tidak pernah di peramban.
$secret   = getenv('NALAR_VISITOR_SECRET');   // rahasia dari dashboard Nalar
$visitor  = (string) $currentUser->id;        // penanda pengguna Anda sendiri
$signature = hash_hmac('sha256', $visitor, $secret);
?>
<script src="https://rag.sainskerta.net/embed.js"
        data-chatbot="cb_live_xxx"
        data-visitor="<?= htmlspecialchars($visitor) ?>"
        data-visitor-sig="<?= $signature ?>"></script>`;

const NODE = `// Dijalankan di SERVER Anda (Express/Next/NestJS), tidak pernah di peramban.
import { createHmac } from 'node:crypto';

const secret = process.env.NALAR_VISITOR_SECRET;   // rahasia dari dashboard
const visitor = String(currentUser.id);            // penanda pengguna Anda
const signature = createHmac('sha256', secret).update(visitor).digest('hex');

// Kirim \`visitor\` dan \`signature\` ke template, lalu:
// <script src="https://rag.sainskerta.net/embed.js"
//         data-chatbot="cb_live_xxx"
//         data-visitor="\${visitor}" data-visitor-sig="\${signature}"></script>`;

const PYTHON = `# Dijalankan di SERVER Anda (Django/Flask/FastAPI), tidak pernah di browser.
import hmac, hashlib, os

secret = os.environ["NALAR_VISITOR_SECRET"].encode()   # rahasia dari dashboard
visitor = str(current_user.id).encode()                # penanda pengguna Anda
signature = hmac.new(secret, visitor, hashlib.sha256).hexdigest()

# Kirim visitor & signature ke template, lalu:
# <script src="https://rag.sainskerta.net/embed.js"
#         data-chatbot="cb_live_xxx"
#         data-visitor="{{ visitor }}" data-visitor-sig="{{ signature }}"></script>`;

const GO = `// Dijalankan di SERVER Anda, tidak pernah di peramban.
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "os"
)

func tandaTanganPengunjung(visitor string) string {
    secret := []byte(os.Getenv("NALAR_VISITOR_SECRET")) // rahasia dari dashboard
    mac := hmac.New(sha256.New, secret)
    mac.Write([]byte(visitor))
    return hex.EncodeToString(mac.Sum(nil))
}

// Sisipkan hasilnya ke template:
// <script src="https://rag.sainskerta.net/embed.js"
//         data-chatbot="cb_live_xxx"
//         data-visitor="{{.Visitor}}" data-visitor-sig="{{.Signature}}"></script>`;

const JAVA = `// Dijalankan di SERVER Anda (Spring/Jakarta EE), tidak pernah di peramban.
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

public static String tandaTanganPengunjung(String visitor) throws Exception {
    String secret = System.getenv("NALAR_VISITOR_SECRET"); // rahasia dari dashboard
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    return HexFormat.of().formatHex(mac.doFinal(visitor.getBytes(StandardCharsets.UTF_8)));
}

// Sisipkan hasilnya ke template:
// <script src="https://rag.sainskerta.net/embed.js"
//         data-chatbot="cb_live_xxx"
//         data-visitor="\${visitor}" data-visitor-sig="\${signature}"></script>`;

export const CONTOH_TANDA_TANGAN: ContohBahasa[] = [
  { id: 'php', label: 'PHP', berkas: 'template.php', kode: PHP },
  { id: 'node', label: 'Node.js', berkas: 'server.js', kode: NODE },
  { id: 'python', label: 'Python', berkas: 'views.py', kode: PYTHON },
  { id: 'go', label: 'Go', berkas: 'handler.go', kode: GO },
  { id: 'java', label: 'Java', berkas: 'ChatWidget.java', kode: JAVA },
];
