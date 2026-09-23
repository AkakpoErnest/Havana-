import type { Conversation, Message } from './types';

export type ChatData = {
  conversation: Conversation;
  messages: Message[];
  hasMore: boolean;
  cursor: string;
};

/** Incoming records replace existing offers; messages outside a poll's window survive. */
export function mergeMessages(previous: Message[], incoming: Message[]): Message[] {
  const records = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) records.set(message.id, message);
  return [...records.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function mergeLatest(previous: ChatData | undefined, incoming: ChatData): ChatData {
  return {
    ...incoming,
    messages: mergeMessages(previous?.messages ?? [], incoming.messages),
    // `hasMore` describes the oldest page loaded; a rolling poll must not reset it.
    hasMore: previous?.hasMore ?? incoming.hasMore,
  };
}

export function mergeHistory(current: ChatData, older: ChatData): ChatData {
  return {
    ...current,
    // Keep the newer poll's state when an older page overlaps an updated offer.
    messages: mergeMessages(older.messages, current.messages),
    hasMore: older.hasMore,
    // The newest response owns the next incremental-poll cursor.
    cursor: current.cursor,
  };
}
