/**
 * In-process event bus — komunikasi antar module (MODULAR-MONOLITH.md).
 * Module TIDAK saling import service secara silang untuk side-effect;
 * mereka men-dispatch event dan module lain mendengarkan.
 *
 * Typed map: menambah event = menambah satu baris di NalarEvents.
 */

export interface NalarEvents {
  'chatbot.created':  { tenantId: string; chatbotId: string; ownerId: string };
  'chatbot.deleted':  { tenantId: string; chatbotId: string };
  'chatbot.restored': { tenantId: string; chatbotId: string };
  'document.ingested':{ tenantId: string; knowledgeBaseId: string; documentId: string; chunks: number };
  'document.deleted': { tenantId: string; knowledgeBaseId: string; documentId: string };
  'conversation.turn':{ tenantId: string; chatbotId: string; conversationId: string };
  'source.connected': { tenantId: string; knowledgeBaseId: string; sourceId: string; kind: string };
  'memory.note.upserted': { tenantId: string; chatbotId: string; noteId: string; slug: string };
}

type Handler<K extends keyof NalarEvents> = (payload: NalarEvents[K]) => void | Promise<void>;

const handlers = new Map<keyof NalarEvents, Set<Handler<never>>>();

export function on<K extends keyof NalarEvents>(event: K, handler: Handler<K>): () => void {
  let set = handlers.get(event);
  if (!set) { set = new Set(); handlers.set(event, set); }
  set.add(handler as Handler<never>);
  return () => set!.delete(handler as Handler<never>);
}

/** Fire-and-forget: listener yang gagal tidak menggagalkan alur utama. */
export async function dispatch<K extends keyof NalarEvents>(event: K, payload: NalarEvents[K]): Promise<void> {
  const set = handlers.get(event);
  if (!set) return;
  await Promise.allSettled(
    [...set].map(async (h) => {
      try { await (h as Handler<K>)(payload); }
      catch (err) { console.error(`[events] listener for "${event}" failed:`, err); }
    }),
  );
}
