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
    ];
  },
};

export default nextConfig;
