/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@xenova/transformers', 'postgres'],
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
