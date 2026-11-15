import { afterEach, describe, expect, it, vi } from 'vitest';
import { Codai } from '../index';

afterEach(() => vi.unstubAllGlobals());

const mk = () => new Codai({ apiKey: 'sk-test', maxRetries: 0 });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('music.generate', () => {
  it('posts to /v1/audio/music and decodes the WAV clips + headers', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return json(
          {
            created: 1790000000,
            model: 'lyria-002',
            data: [
              {
                b64_json: 'AAEC',
                mime_type: 'audio/wav',
                duration_seconds: 30,
                sample_rate: 48000,
              },
              {
                b64_json: 'AwQ=',
                mime_type: 'audio/wav',
                duration_seconds: 30,
                sample_rate: 48000,
              },
            ],
          },
          200,
          { 'x-codai-routed-to': 'lyria-002', 'x-codai-cost-micro-usd': '120000' },
        );
      }),
    );
    const r = await mk().music.generate({ prompt: 'calm lo-fi piano', n: 2 });
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/audio/music');
    expect(calls[0]!.body).toEqual({ prompt: 'calm lo-fi piano', n: 2 });
    expect(r.clips.map((c) => [...c])).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(r.mimeTypes).toEqual(['audio/wav', 'audio/wav']);
    expect(r.routedTo).toBe('lyria-002');
    expect(r.costMicroUsd).toBe(120000);
    expect(r.assets).toEqual([]);
  });

  it("response_format 'url' sends the field and returns assets instead of clips", async () => {
    const asset = {
      asset_id: '7d0f2c1e-0000-4000-8000-000000000001',
      kind: 'music',
      status: 'ready',
      model: 'lyria-002',
      url: 'https://storage.googleapis.com/b/u/x.wav?X-Goog-Signature=abc',
      mime_type: 'audio/wav',
      bytes: 5760044,
      duration_seconds: 30,
      width: null,
      height: null,
      created_at: '2026-10-10T08:00:00.000Z',
      expires_at: '2026-10-10T09:00:00.000Z',
    };
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return json({ created: 1790000000, model: 'lyria-002', data: [asset] });
      }),
    );
    const r = await mk().music.generate({ prompt: 'calm lo-fi piano', response_format: 'url' });
    expect(calls[0]).toEqual({ prompt: 'calm lo-fi piano', response_format: 'url' });
    expect(r.clips).toEqual([]);
    expect(r.assets).toEqual([asset]);
    expect(r.mimeTypes).toEqual(['audio/wav']);
  });

  it('passes Lyria 3 fields through and surfaces lyrics / caption / lyrics_match / warnings', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return json(
          {
            created: 1790000000,
            model: 'codai-music-pro',
            data: [
              {
                b64_json: 'AAEC',
                mime_type: 'audio/mpeg',
                duration_seconds: 64.2,
                lyrics: '[0:4] Noaptea cade peste oraș',
                caption: 'synth pop, bpm: 118, duration_secs: 64',
                lyrics_match: 0.42,
                warnings: ['lyrics_mismatch'],
              },
            ],
          },
          200,
          { 'x-codai-cost-micro-usd': '80000' },
        );
      }),
    );
    const body = {
      model: 'codai-music-pro' as const,
      prompt: 'synth pop ballad',
      lyrics: 'Noaptea cade peste oraș',
      bpm: 118,
      duration_seconds: 60,
      language: 'ro',
      instrumental: false,
    };
    const r = await mk().music.generate(body);
    expect(calls[0]).toEqual(body);
    expect(r.mimeTypes).toEqual(['audio/mpeg']);
    expect(r.tracks).toEqual([
      {
        lyrics: '[0:4] Noaptea cade peste oraș',
        caption: 'synth pop, bpm: 118, duration_secs: 64',
        lyrics_match: 0.42,
        warnings: ['lyrics_mismatch'],
      },
    ]);
    expect(r.warnings).toEqual(['lyrics_mismatch']);
    expect(r.costMicroUsd).toBe(80000);
  });
});

describe('audio.speechJson', () => {
  it('defaults to codai-speech + timestamps:true, decodes b64 audio and returns word timings', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return json({
          object: 'audio.speech',
          model: 'codai-speech',
          voice: 'Aoede',
          language: 'ro-RO',
          mime_type: 'audio/mpeg',
          duration_seconds: 1.4,
          b64_json: 'AAEC',
          words: [
            { word: 'Bună', start: 0.1, end: 0.5 },
            { word: 'ziua', start: 0.55, end: 1.0 },
          ],
          cost_micro_usd: '480',
        });
      }),
    );
    const r = await mk().audio.speechJson({ input: 'Bună ziua', language: 'ro-RO' });
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/audio/speech');
    expect(calls[0]!.body).toEqual({
      input: 'Bună ziua',
      language: 'ro-RO',
      model: 'codai-speech',
      timestamps: true,
    });
    expect([...r.audio]).toEqual([0, 1, 2]);
    expect(r.words).toEqual([
      { word: 'Bună', start: 0.1, end: 0.5 },
      { word: 'ziua', start: 0.55, end: 1.0 },
    ]);
    expect(r.asset).toBeNull();
    expect(r.costMicroUsd).toBe(480);
    expect(r.durationSeconds).toBe(1.4);
    expect(r.timestampsUnavailable).toBe(false);
  });

  it('store:true returns the asset, no audio bytes, and flags x-codai-timestamps: unavailable', async () => {
    const asset = {
      asset_id: '7d0f2c1e-0000-4000-8000-000000000002',
      kind: 'speech',
      status: 'ready',
      model: 'codai-speech',
      url: 'https://storage.googleapis.com/b/u/x.mp3?X-Goog-Signature=abc',
      mime_type: 'audio/mpeg',
      bytes: 22000,
      duration_seconds: 1.4,
      width: null,
      height: null,
      created_at: '2026-10-10T08:00:00.000Z',
      expires_at: '2026-10-10T09:00:00.000Z',
    };
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return json(
          {
            object: 'audio.speech',
            model: 'codai-speech',
            voice: 'Charon',
            language: 'ro-RO',
            mime_type: 'audio/mpeg',
            duration_seconds: 1.4,
            asset,
            words: null,
            cost_micro_usd: '480',
          },
          200,
          { 'x-codai-timestamps': 'unavailable' },
        );
      }),
    );
    const r = await mk().audio.speechJson({
      input: 'Bună ziua',
      voice: 'Charon',
      store: true,
      timestamps: true,
    });
    expect(calls[0]).toMatchObject({ store: true, timestamps: true, voice: 'Charon' });
    expect(r.audio.length).toBe(0);
    expect(r.asset).toEqual(asset);
    expect(r.words).toBeNull();
    expect(r.timestampsUnavailable).toBe(true);
  });

  it('store:true without timestamps does not force timestamps', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return json({
          object: 'audio.speech',
          model: 'codai-speech',
          voice: 'Aoede',
          language: 'ro-RO',
          mime_type: 'audio/mpeg',
          duration_seconds: 1,
          cost_micro_usd: '300',
        });
      }),
    );
    await mk().audio.speechJson({ input: 'Salut', store: true });
    expect(calls[0]).not.toHaveProperty('timestamps');
  });

  it('speech() with codai-speech does not inject the Azure default voice', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } });
      }),
    );
    await mk().audio.speech({ input: 'Salut', model: 'codai-speech' });
    await mk().audio.speech({ input: 'Hi' });
    expect(calls[0]).toEqual({ input: 'Salut', model: 'codai-speech' });
    expect(calls[1]).toEqual({ input: 'Hi', model: 'codai-tts', voice: 'alloy' });
  });
});

describe('videos', () => {
  it('generate() creates the job then polls GET until succeeded', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const replies = [
      json(
        {
          id: 'vid1.abc.def',
          object: 'video.job',
          status: 'running',
          model: 'veo-3.1-fast-generate-001',
          seconds: 4,
          estimated_cost_micro_usd: '400000',
        },
        202,
      ),
      json({ id: 'vid1.abc.def', object: 'video.job', status: 'running' }),
      json({
        id: 'vid1.abc.def',
        object: 'video.job',
        status: 'succeeded',
        seconds: 4,
        data: [{ b64_json: 'AAEC', mime_type: 'video/mp4' }],
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: String(init.method) });
        return replies.shift()!;
      }),
    );
    const r = await mk().videos.generate(
      { prompt: 'a paper plane over Bucharest', seconds: 4 },
      { pollIntervalMs: 1 },
    );
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET']);
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/videos');
    expect(calls[1]!.url).toBe('https://ai.codai.ro/v1/videos/vid1.abc.def');
    expect([...r.video]).toEqual([0, 1, 2]);
    expect(r.mimeType).toBe('video/mp4');
    expect(r.id).toBe('vid1.abc.def');
    expect(r.seconds).toBe(4);
    expect(r.asset).toBeNull();
  });

  it("retrieve() with responseFormat 'url' sends the query param; generate() returns the asset", async () => {
    const asset = {
      asset_id: '7d0f2c1e-0000-4000-8000-000000000002',
      kind: 'video',
      status: 'ready',
      model: 'veo-3.1-fast-generate-001',
      url: 'https://storage.googleapis.com/b/u/v.mp4?X-Goog-Signature=abc',
      mime_type: 'video/mp4',
      bytes: 1234567,
      duration_seconds: 4,
      width: null,
      height: null,
      created_at: '2026-10-10T08:00:00.000Z',
      expires_at: '2026-10-10T09:00:00.000Z',
    };
    const urls: string[] = [];
    const replies = [
      json(
        {
          id: 'vid1.u.u',
          object: 'video.job',
          status: 'running',
          model: 'veo',
          seconds: 4,
          estimated_cost_micro_usd: '400000',
        },
        202,
      ),
      json({ id: 'vid1.u.u', object: 'video.job', status: 'succeeded', seconds: 4, data: [asset] }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return replies.shift()!;
      }),
    );
    const r = await mk().videos.generate(
      { prompt: 'x', seconds: 4 },
      { pollIntervalMs: 1, responseFormat: 'url' },
    );
    expect(urls[1]).toBe('https://ai.codai.ro/v1/videos/vid1.u.u?response_format=url');
    expect(r.asset).toEqual(asset);
    expect(r.video.length).toBe(0);
    expect(r.mimeType).toBe('video/mp4');
    expect(r.seconds).toBe(4);
  });

  it('generate() throws when the job is filtered', async () => {
    const replies = [
      json(
        {
          id: 'vid1.x.y',
          object: 'video.job',
          status: 'running',
          model: 'veo',
          seconds: 8,
          estimated_cost_micro_usd: '800000',
        },
        202,
      ),
      json({
        id: 'vid1.x.y',
        object: 'video.job',
        status: 'filtered',
        error: 'Blocked by the upstream safety filter',
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => replies.shift()!),
    );
    await expect(mk().videos.generate({ prompt: 'x' }, { pollIntervalMs: 1 })).rejects.toThrow(
      /filtered: Blocked/,
    );
  });

  it('generate() throws on timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) =>
        init.method === 'POST'
          ? json(
              {
                id: 'vid1.t.t',
                object: 'video.job',
                status: 'running',
                model: 'veo',
                seconds: 8,
                estimated_cost_micro_usd: '800000',
              },
              202,
            )
          : json({ id: 'vid1.t.t', object: 'video.job', status: 'running' }),
      ),
    );
    await expect(
      mk().videos.generate({ prompt: 'x' }, { pollIntervalMs: 5, timeoutMs: 1 }),
    ).rejects.toThrow(/did not finish/);
  });
});

describe('renders', () => {
  const queued = {
    id: '9c1d2e3f-0000-4000-8000-000000000010',
    object: 'studio.render',
    status: 'queued',
    model: 'codai-render',
    quality: 'final',
    aspect_ratio: '16:9',
    fps: 30,
    price_micro_usd_per_second: '10000',
    minimum_micro_usd: '50000',
  };
  const base = {
    id: queued.id,
    object: 'studio.render',
    quality: 'final',
    aspect_ratio: '16:9',
    fps: 30,
  };
  const asset = {
    asset_id: queued.id,
    kind: 'render',
    status: 'ready',
    model: 'codai-render',
    url: 'https://storage.googleapis.com/b/u/r.mp4?X-Goog-Signature=abc',
    mime_type: 'video/mp4',
    bytes: 4812345,
    duration_seconds: 31.2,
    width: 1920,
    height: 1080,
    created_at: '2026-10-10T08:00:00.000Z',
    expires_at: '2026-10-10T09:00:00.000Z',
  };
  const html = '<div data-composition-id="x" data-width="1920" data-height="1080"></div>';

  it('render() queues the render then polls GET until succeeded', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const replies = [
      json(queued, 202),
      json({ ...base, status: 'rendering', progress: 0.4, error: null }),
      json({
        ...base,
        status: 'succeeded',
        progress: 1,
        error: null,
        qa: { duration_seconds: 31.2, width: 1920, height: 1080, lufs: -14.1, warnings: [] },
        cost_micro_usd: '320000',
        data: [asset],
        poster_url: 'https://storage.googleapis.com/b/u/r.poster.jpg?X-Goog-Signature=abc',
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: String(init.method),
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return replies.shift()!;
      }),
    );
    const r = await mk().renders.render({ html, quality: 'final' }, { pollIntervalMs: 1 });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET']);
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/studio/renders');
    expect(calls[0]!.body).toEqual({ html, quality: 'final' });
    expect(calls[1]!.url).toBe(`https://ai.codai.ro/v1/studio/renders/${queued.id}`);
    expect(r.id).toBe(queued.id);
    expect(r.asset).toEqual(asset);
    expect(r.qa?.lufs).toBe(-14.1);
    expect(r.costMicroUsd).toBe(320000);
    expect(r.posterUrl).toMatch(/poster\.jpg/);
  });

  it('create() forwards ai_label and returns the resolved label', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return json({ ...queued, ai_label: 'end_card' }, 202);
      }),
    );
    const job = await mk().renders.create({ html, ai_label: 'end_card' });
    expect(bodies[0]).toEqual({ html, ai_label: 'end_card' });
    expect(job.ai_label).toBe('end_card');
  });

  it('create() and retrieve() hit the documented paths', async () => {
    const urls: string[] = [];
    const replies = [
      json(queued, 202),
      json({ ...base, status: 'queued', progress: 0, error: null }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return replies.shift()!;
      }),
    );
    const job = await mk().renders.create({ html });
    expect(job.price_micro_usd_per_second).toBe('10000');
    const st = await mk().renders.retrieve(job.id);
    expect(st.status).toBe('queued');
    expect(urls).toEqual([
      'https://ai.codai.ro/v1/studio/renders',
      `https://ai.codai.ro/v1/studio/renders/${queued.id}`,
    ]);
  });

  it('render() throws when the render failed', async () => {
    const replies = [
      json(queued, 202),
      json({
        ...base,
        status: 'failed',
        progress: 0.2,
        error: 'lint_failed: missing data-duration',
      }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => replies.shift()!),
    );
    await expect(mk().renders.render({ html }, { pollIntervalMs: 1 })).rejects.toThrow(
      /render failed: lint_failed/,
    );
  });

  it('render() throws on timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) =>
        init.method === 'POST'
          ? json(queued, 202)
          : json({ ...base, status: 'rendering', progress: 0.1, error: null }),
      ),
    );
    await expect(
      mk().renders.render({ html }, { pollIntervalMs: 5, timeoutMs: 1 }),
    ).rejects.toThrow(/did not finish/);
  });

  const capture = (replies: Response[]) => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: String(init.method),
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return replies.shift()!;
      }),
    );
    return calls;
  };

  it('list() sends before / limit / root_render_id and returns the page', async () => {
    const page = {
      object: 'list',
      data: [
        {
          id: queued.id,
          object: 'studio.render',
          status: 'succeeded',
          title: 'Teaser',
          quality: 'final',
          aspect_ratio: '16:9',
          fps: 30,
          duration_seconds: 10,
          cost_micro_usd: '100000',
          created_at: '2026-10-10T08:00:00.000Z',
          parent_render_id: null,
          root_render_id: queued.id,
          has_timeline: true,
          scene_count: 2,
        },
      ],
      next_before: '2026-10-10T08:00:00.000Z',
    };
    const calls = capture([json(page), json({ object: 'list', data: [], next_before: null })]);
    const r = await mk().renders.list({
      before: '2026-10-11T00:00:00.000Z',
      limit: 10,
      rootRenderId: queued.id,
    });
    expect(r.data[0]!.scene_count).toBe(2);
    expect(r.next_before).toBe('2026-10-10T08:00:00.000Z');
    const u = new URL(calls[0]!.url);
    expect(calls[0]!.method).toBe('GET');
    expect(u.pathname).toBe('/v1/studio/renders');
    expect(u.searchParams.get('before')).toBe('2026-10-11T00:00:00.000Z');
    expect(u.searchParams.get('limit')).toBe('10');
    expect(u.searchParams.get('root_render_id')).toBe(queued.id);
    await mk().renders.list();
    expect(calls[1]!.url).toBe('https://ai.codai.ro/v1/studio/renders');
  });

  it('createTimeline() posts the scenes to /v1/studio/timelines', async () => {
    const accepted = {
      ...queued,
      narration_cost_micro_usd: '1200',
      scene_count: 2,
      duration_seconds: 10,
      root_render_id: queued.id,
    };
    const calls = capture([json(accepted, 202)]);
    const body = {
      title: 'Teaser',
      quality: 'draft' as const,
      scenes: [
        {
          kind: 'image' as const,
          asset_id: '3f2b8c1e-0000-4000-8000-000000000001',
          seconds: 4,
          narration: { text: 'Bună dimineața.' },
        },
        { kind: 'video' as const, asset_id: '3f2b8c1e-0000-4000-8000-000000000002' },
      ],
    };
    const job = await mk().renders.createTimeline(body);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://ai.codai.ro/v1/studio/timelines');
    expect(calls[0]!.body).toEqual(body);
    expect(job.root_render_id).toBe(queued.id);
    expect(job.narration_cost_micro_usd).toBe('1200');
  });

  it('regenerateScene() posts to the encoded scene path', async () => {
    const accepted = {
      id: '9c1d2e3f-0000-4000-8000-000000000021',
      object: 'studio.render',
      status: 'queued',
      parent_render_id: queued.id,
      root_render_id: queued.id,
      scene_id: 's1',
      scene_cost_micro_usd: '40000',
      price_micro_usd_per_second: '10000',
      minimum_micro_usd: '50000',
    };
    const calls = capture([json(accepted, 202)]);
    const job = await mk().renders.regenerateScene(queued.id, 's1', {
      visual: { prompt: 'dusk' },
      narration: null,
    });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(
      `https://ai.codai.ro/v1/studio/renders/${queued.id}/scenes/s1/regenerate`,
    );
    expect(calls[0]!.body).toEqual({ visual: { prompt: 'dusk' }, narration: null });
    expect(job.parent_render_id).toBe(queued.id);
    expect(job.scene_cost_micro_usd).toBe('40000');
  });

  it('retrieve() sends expand=assets only when expandAssets is set', async () => {
    const st = {
      ...base,
      status: 'queued',
      progress: 0,
      stage: 'generating_scene',
      error: null,
      title: null,
      parent_render_id: queued.id,
      root_render_id: queued.id,
      timeline: { transition: 'fade', music: null, scenes: [] },
    };
    const calls = capture([json(st), json(st)]);
    const r = await mk().renders.retrieve(queued.id, { expandAssets: true });
    expect(calls[0]!.url).toBe(`https://ai.codai.ro/v1/studio/renders/${queued.id}?expand=assets`);
    expect(r.stage).toBe('generating_scene');
    expect(r.timeline?.transition).toBe('fade');
    await mk().renders.retrieve(queued.id);
    expect(calls[1]!.url).toBe(`https://ai.codai.ro/v1/studio/renders/${queued.id}`);
  });
});
