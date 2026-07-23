export const metadata = {
  title: 'RAG Engine',
  description: 'Multi-tenant RAG platform with pluggable models and embeddable chatbots',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0b0b0f', color: '#e5e7eb' }}>
        {children}
      </body>
    </html>
  );
}
