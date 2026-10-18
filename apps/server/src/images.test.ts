import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inlineImageSource } from './images.js';

test('inlines an http image and preserves data URIs', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(16 * 1024 * 1024) });
      res.end('nope');
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(Buffer.from('png'));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const inlined = await inlineImageSource(`http://127.0.0.1:${port}/logo.png`);
    assert.equal(inlined, `data:image/png;base64,${Buffer.from('png').toString('base64')}`);
    assert.equal(await inlineImageSource('data:image/png;base64,YQ=='), 'data:image/png;base64,YQ==');
    await assert.rejects(() => inlineImageSource('file:///etc/passwd'), /http\(s\)/);
    await assert.rejects(() => inlineImageSource(`http://127.0.0.1:${port}/big`), /15 MB/);
    await assert.rejects(() => inlineImageSource('http://169.254.169.254/latest/meta-data/'), /link-local/);
    await assert.rejects(() => inlineImageSource('http://metadata.google.internal/computeMetadata/v1/'), /metadata/);
  } finally {
    server.close();
  }
});

test('image redirects cannot enter the private network and bodies are capped', async () => {
  const redirectTo = (location: string): typeof fetch => async (input) => {
    const href = input instanceof URL ? input.href : String(input);
    if (!href.startsWith('http://8.8.8.8/')) throw new Error(`unexpected fetch ${href}`);
    return new Response(null, { status: 302, headers: { location } });
  };
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/img.png', redirectTo('http://169.254.169.254/latest')), /link-local/);
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/img.png', redirectTo('http://127.0.0.1/secret')), /private/);

  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent > 15 * 1024 * 1024) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    }
  });
  const fetcher: typeof fetch = async () => new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } });
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/huge.png', fetcher), /15 MB/);
});
