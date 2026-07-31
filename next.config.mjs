/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@xenova/transformers', 'postgres', 'pdf-parse', 'mammoth', 'googleapis'],
  images: { unoptimized: true },  // logo PNG statis — tak perlu sharp
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // pptxgenjs (ekspor PPTX di Dataroom, client-side) menyeret modul Node
      // di jalur yang tak pernah tereksekusi di browser. Skema `node:` tidak
      // kena resolve.fallback, jadi prefiksnya dilepas dulu baru di-stub.
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }));
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, https: false, http: false, os: false, path: false, stream: false, zlib: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        // Public embed endpoints + widget must be reachable cross-origin
        // from any customer website. Per-chatbot origin allow-listing is
        // still enforced in the route handler (see api/chat/[chatbotId]).
        source: '/(embed.js|api/chat/:path*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
      {
        /* Halaman chat penuh MEMANG untuk disematkan — mode inline embed.js
           memuatnya di dalam iframe pada situs pelanggan. Dinyatakan tegas
           supaya tak ada yang "mengeraskan" keamanan belakangan dengan
           memasang X-Frame-Options global lalu mematikan fitur ini tanpa
           sadar. Pembatasan siapa yang boleh memakainya tetap ada di tempat
           yang benar: daftar izin origin per chatbot di route handler. */
        source: '/c/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
      {
        /* SISANYA tak boleh dibingkai sama sekali. Sebelumnya tak ada
           proteksi apa pun — dasbor bisa ditumpuk di bawah halaman penyerang
           dan kliknya dicuri (clickjacking). Selama tak ada iframe yang
           dipakai produk ini, celah itu tak kentara; begitu iframe jadi pola
           resmi lewat mode inline, membiarkannya terbuka jadi kelalaian.
           Dua header sekaligus: frame-ancestors untuk peramban modern,
           X-Frame-Options untuk yang belum mendukungnya. */
        source: '/((?!c/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
