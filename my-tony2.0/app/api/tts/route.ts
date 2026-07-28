export async function POST(request: Request) {
  try {
    const { text, voice = 'Cherry' } = await request.json();
    if (!text) return Response.json({ error: 'text required' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.openai-next.com').replace(/\/+$/, '');

    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'qwen3-tts-flash', input: text, voice }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[tts error]', res.status, err);
      return Response.json({ error: 'TTS failed' }, { status: 500 });
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e) {
    console.error('[tts error]', e);
    return Response.json({ error: 'TTS failed' }, { status: 500 });
  }
}
