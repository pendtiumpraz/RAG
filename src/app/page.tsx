export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 34 }}>RAG Engine</h1>
      <p style={{ color: '#9ca3af', lineHeight: 1.6 }}>
        Multi-tenant Retrieval-Augmented-Generation platform. Pick any LLM and
        embedding model, connect your own Google Drive / SharePoint, and embed a
        chatbot on any website. Each chatbot ID has its own isolated knowledge base.
      </p>
      <ul style={{ lineHeight: 2 }}>
        <li><a href="/settings" style={{ color: '#818cf8' }}>Settings</a> — choose the active LLM + embedding model, save API keys</li>
        <li><a href="/chatbots" style={{ color: '#818cf8' }}>Chatbots</a> — create embeddable chatbots &amp; connect data sources</li>
        <li><a href="/conversations" style={{ color: '#818cf8' }}>Conversations</a> — full chat history</li>
      </ul>
    </main>
  );
}
