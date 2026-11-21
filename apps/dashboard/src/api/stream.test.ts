import { afterEach, expect, it, vi } from 'vitest';
import { configureClient, streamRequest } from './client';
afterEach(() => { vi.unstubAllGlobals(); configureClient(null, null); });
it('decodes split Korean UTF-8 and multiple SSE frames while retaining scope and CSRF', async () => {
  const raw = new TextEncoder().encode('data: {"type":"delta","text":"좌석 확인"}\n\ndata: {"type":"complete"}\n\n');
  const body = new ReadableStream({ start(controller) { for (let i = 0; i < raw.length; i += 3) controller.enqueue(raw.slice(i, i + 3)); controller.close(); } });
  const fetch = vi.fn().mockResolvedValue(new Response(body)); vi.stubGlobal('fetch', fetch);
  configureClient('csrf-test', 'site-test');
  const events: unknown[] = [];
  await streamRequest('/api/agent/conversations/test/messages', { content: '여기 정리' }, new AbortController().signal, e => events.push(e));
  expect(events).toEqual([{ type: 'delta', text: '좌석 확인' }, { type: 'complete' }]);
  expect(fetch.mock.calls[0][0]).toContain('site_id=site-test');
  expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('csrf-test');
  expect(JSON.stringify(fetch.mock.calls)).not.toContain('OPENAI_API_KEY');
});
it('does not treat a truncated stream as a completed response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: {"type":"delta","text":"partial"}\n\n')));
  await expect(streamRequest('/api/agent/test', {}, new AbortController().signal, () => {})).rejects.toThrow('연결이 끊겼습니다');
});
it('preserves server rejection instead of attempting to parse it as a stream', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '승인 권한이 없습니다.' }), { status: 403 })));
  await expect(streamRequest('/api/agent/test', {}, new AbortController().signal, () => {})).rejects.toThrow('승인 권한');
});
