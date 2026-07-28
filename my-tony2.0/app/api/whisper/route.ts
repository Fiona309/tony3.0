export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get('audio') as File | null;
    if (!audio) return Response.json({ error: 'no audio' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.openai-next.com').replace(/\/+$/, '');

    const upstream = new FormData();
    upstream.append('model', 'whisper-large-v3-turbo');
    upstream.append('language', 'zh');
    upstream.append('temperature', '0');
    upstream.append('file', audio, 'audio.webm');

    const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[whisper]', res.status, err);
      return Response.json({ error: 'asr failed' }, { status: 500 });
    }
    const data = await res.json();
    return Response.json({ text: data.text || '' });
  } catch (e) {
    console.error('[whisper error]', e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
