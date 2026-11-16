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
  /**
   * Where `error` is thrown: `start` before any event (an HTTP error or a dropped connection),
   * `text` after the text chunks (the default), before `message_delta` brings the output count.
   */
  errorAt?: 'start' | 'text';
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
      if (reply.error && reply.errorAt === 'start') throw reply.error;
      // Like the API: message_start carries the input and cache counts and a token or so of
      // output; message_delta at the end carries the cumulative output count.
      yield { type: 'message_start', message: { ...message, content: [], usage: { ...message.usage, output_tokens: 1 } } };
      yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      for (const text of reply.chunks) {
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
      }
      if (reply.error) throw reply.error;
      yield { type: 'content_block_stop', index: 0 };
      yield {
        type: 'message_delta',
        delta: { stop_reason: message.stop_reason, stop_sequence: null },
        usage: {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
          cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
          cache_read_input_tokens: message.usage.cache_read_input_tokens,
        },
      };
      yield { type: 'message_stop' };
    },
    finalMessage: async () => {
      if (reply.error) throw reply.error;
      return message;
    },
  };
}
