import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineImageSource } from './images.js';

test('rejects private, loopback, link-local, and metadata hosts on the first hop', async () => {
  await assert.rejects(() => inlineImageSource('http://127.0.0.1/logo.png'), /private/);
  await assert.rejects(() => inlineImageSource('http://10.0.0.5/logo.png'), /private/);
  await assert.rejects(() => inlineImageSource('http://192.168.1.5/logo.png'), /private/);
  await assert.rejects(() => inlineImageSource('http://localhost/logo.png'), /private/);
  await assert.rejects(() => inlineImageSource('http://169.254.169.254/latest/meta-data/'), /link-local/);
  await assert.rejects(() => inlineImageSource('http://metadata.google.internal/computeMetadata/v1/'), /metadata/);
  await assert.rejects(() => inlineImageSource('http://100.100.100.200/latest/meta-data/'), /private/);
  await assert.rejects(() => inlineImageSource('http://[::1]/logo.png'), /private/);
  await assert.rejects(() => inlineImageSource('file:///etc/passwd'), /http\(s\)/);
});

test('inlines a public image and preserves small data URIs', async () => {
  const fetcher: typeof fetch = async () => new Response(Buffer.from('png'), { status: 200, headers: { 'content-type': 'image/png' } });
  const inlined = await inlineImageSource('http://8.8.8.8/logo.png', fetcher);
  assert.equal(inlined, `data:image/png;base64,${Buffer.from('png').toString('base64')}`);
  assert.equal(await inlineImageSource('data:image/png;base64,YQ=='), 'data:image/png;base64,YQ==');
  await assert.rejects(() => inlineImageSource(`data:image/png;base64,${'A'.repeat(21 * 1024 * 1024)}`), /15 MB/);
});

test('image redirects cannot enter the private network and bodies are capped', async () => {
  const redirectTo = (location: string): typeof fetch => async () => new Response(null, { status: 302, headers: { location } });
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/img.png', redirectTo('http://169.254.169.254/latest')), /link-local/);
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/img.png', redirectTo('http://127.0.0.1/secret')), /private/);
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/img.png', redirectTo('file:///etc/passwd')), /http\(s\)/);

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

  const declared: typeof fetch = async () => new Response('nope', { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(16 * 1024 * 1024) } });
  await assert.rejects(() => inlineImageSource('http://8.8.8.8/big.png', declared), /15 MB/);
});
