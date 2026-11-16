/**
 * Cubyntra - Fake Anthropic message streams for coach tests (no network).
 *
 * Tests mock `@anthropic-ai/sdk` so the client's `messages.stream` is `streamMock`; these
 * helpers build what that mock returns.
 */

import type Anthropic from '@anthropic-ai/sdk';

export interface FakeReply {
  chunks: string[];
  stopReason?: Anthropic.StopReason;
  usage?: Partial<Anthropic.Usage>;
  /** Throw this from the stream instead of finishing. */
  error?: unknown;
}

export const DEFAULT_USAGE = {
  input_tokens: 300,
  output_tokens: 120,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 4500,
};

export function fakeStream(reply: FakeReply) {
  const message = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: reply.chunks.join(''), citations: null }],
    stop_reason: reply.stopReason ?? 'end_turn',
    stop_sequence: null,
    usage: { ...DEFAULT_USAGE, ...reply.usage },
  } as unknown as Anthropic.Message;
  return {
    abort: () => {},
    async *[Symbol.asyncIterator]() {
      yield { type: 'message_start', message: { ...message, content: [] } };
      yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      for (const text of reply.chunks) {
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
      }
      if (reply.error) throw reply.error;
      yield { type: 'message_stop' };
    },
    finalMessage: async () => {
      if (reply.error) throw reply.error;
      return message;
    },
  };
}
