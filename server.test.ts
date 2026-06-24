import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './server';
import { smpStep1, smpStep2, smpStep3 } from './src/utils/smp';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createRoom(app: ReturnType<typeof createApp>, overrides?: Record<string, any>) {
  const step1 = smpStep1();
  const res = await request(app).post('/api/rooms').send({
    question: 'Secret question',
    template: 'Custom',
    creatorName: 'Alice',
    creatorG2a: step1.g2a.toString(),
    creatorG3a: step1.g3a.toString(),
    caseSensitive: false,
    ignoreWhitespace: true,
    selfDestruct: false,
    ...overrides,
  });
  return { step1, ...res.body, res };
}

async function joinRoom(
  app: ReturnType<typeof createApp>,
  roomId: string,
  step1: ReturnType<typeof smpStep1>,
  secret = 'password',
) {
  const step2 = await smpStep2(secret, step1.g2a, step1.g3a);
  const res = await request(app).post(`/api/rooms/${roomId}/join`).send({
    name: 'Bob',
    joinerG2b: step2.g2b.toString(),
    joinerG3b: step2.g3b.toString(),
    joinerPb:  step2.pb.toString(),
    joinerQb:  step2.qb.toString(),
  });
  return { step2, ...res.body, res };
}

async function respondRoom(
  app: ReturnType<typeof createApp>,
  roomId: string,
  step1: ReturnType<typeof smpStep1>,
  step2: Awaited<ReturnType<typeof smpStep2>>,
  secret = 'password',
) {
  const step3 = await smpStep3(
    secret, step1.a2, step1.a3,
    step2.g2b, step2.g3b, step2.pb, step2.qb,
  );
  const res = await request(app).post(`/api/rooms/${roomId}/respond`).send({
    creatorPa: step3.pa.toString(),
    creatorQa: step3.qa.toString(),
    creatorRa: step3.ra.toString(),
  });
  return { step3, ...res.body, res };
}

// ── POST /api/rooms ───────────────────────────────────────────────────────────

describe('POST /api/rooms', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { app = createApp(); });

  it('creates a room and returns id, accessCode, question', async () => {
    const { res } = await createRoom(app, { question: 'Who leads the project?' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id).toBeTruthy();
    expect(res.body.accessCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body.question).toBe('Who leads the project?');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/rooms').send({ question: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

// ── GET /api/rooms/:idOrCode ──────────────────────────────────────────────────

describe('GET /api/rooms/:idOrCode', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { app = createApp(); });

  it('fetches room by ID and exposes g2a/g3a for joiner', async () => {
    const { id, step1 } = await createRoom(app);
    const res = await request(app).get(`/api/rooms/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.status).toBe('waiting');
    expect(res.body.creatorG2a).toBe(step1.g2a.toString());
    expect(res.body.creatorG3a).toBe(step1.g3a.toString());
  });

  it('fetches room by access code', async () => {
    const { id, accessCode } = await createRoom(app);
    const res = await request(app).get(`/api/rooms/${accessCode}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('returns 404 for unknown room', async () => {
    const res = await request(app).get('/api/rooms/notexistent');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/rooms/:id/join ──────────────────────────────────────────────────

describe('POST /api/rooms/:id/join', () => {
  let app: ReturnType<typeof createApp>;
  let roomId: string;
  let step1: ReturnType<typeof smpStep1>;

  beforeEach(async () => {
    app = createApp();
    ({ id: roomId, step1 } = await createRoom(app));
  });

  it('joiner submits Step 2 values, status becomes joiner_submitted', async () => {
    const { res } = await joinRoom(app, roomId, step1);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('joiner_submitted');
  });

  it('returns 400 when required join fields are missing', async () => {
    const res = await request(app).post(`/api/rooms/${roomId}/join`).send({ name: 'Bob' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when joining a room that already has a joiner', async () => {
    await joinRoom(app, roomId, step1);
    const { res } = await joinRoom(app, roomId, step1);
    expect(res.status).toBe(400);
  });
});

// ── POST /api/rooms/:id/respond ───────────────────────────────────────────────

describe('POST /api/rooms/:id/respond', () => {
  let app: ReturnType<typeof createApp>;
  let roomId: string;
  let step1: ReturnType<typeof smpStep1>;
  let step2: Awaited<ReturnType<typeof smpStep2>>;

  beforeEach(async () => {
    app = createApp();
    ({ id: roomId, step1 } = await createRoom(app));
    ({ step2 } = await joinRoom(app, roomId, step1));
  });

  it('creator submits Step 3 values, status becomes creator_verified', async () => {
    const { res } = await respondRoom(app, roomId, step1, step2);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const statusRes = await request(app).get(`/api/rooms/${roomId}/status`);
    expect(statusRes.body.status).toBe('creator_verified');
  });

  it('returns 400 if room is not in joiner_submitted state', async () => {
    await respondRoom(app, roomId, step1, step2);
    // Second respond attempt should fail
    const { res } = await respondRoom(app, roomId, step1, step2);
    expect(res.status).toBe(400);
  });

  it('returns 400 when required respond fields are missing', async () => {
    const res = await request(app).post(`/api/rooms/${roomId}/respond`).send({ creatorPa: '123' });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/rooms/:id/complete ──────────────────────────────────────────────

describe('POST /api/rooms/:id/complete', () => {
  let app: ReturnType<typeof createApp>;
  let roomId: string;
  let step1: ReturnType<typeof smpStep1>;
  let step2: Awaited<ReturnType<typeof smpStep2>>;
  let step3: Awaited<ReturnType<typeof smpStep3>>;

  beforeEach(async () => {
    app = createApp();
    ({ id: roomId, step1 } = await createRoom(app));
    ({ step2 } = await joinRoom(app, roomId, step1));
    ({ step3 } = await respondRoom(app, roomId, step1, step2));
  });

  it('joiner submits Rb, status becomes completed', async () => {
    const res = await request(app).post(`/api/rooms/${roomId}/complete`).send({
      joinerRb: step3.ra.toString(), // value doesn't matter — server just stores it
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const statusRes = await request(app).get(`/api/rooms/${roomId}/status`);
    expect(statusRes.body.status).toBe('completed');
  });

  it('returns 400 when joinerRb is missing', async () => {
    const res = await request(app).post(`/api/rooms/${roomId}/complete`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 if room is not in creator_verified state', async () => {
    await request(app).post(`/api/rooms/${roomId}/complete`).send({ joinerRb: '1' });
    const res = await request(app).post(`/api/rooms/${roomId}/complete`).send({ joinerRb: '1' });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/rooms/:id/status ─────────────────────────────────────────────────

describe('GET /api/rooms/:id/status', () => {
  it('exposes joiner Step 2 values after join', async () => {
    const app = createApp();
    const { id, step1 } = await createRoom(app);
    const { step2 } = await joinRoom(app, id, step1);

    const res = await request(app).get(`/api/rooms/${id}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('joiner_submitted');
    expect(res.body.joinerG2b).toBe(step2.g2b.toString());
    expect(res.body.joinerG3b).toBe(step2.g3b.toString());
    expect(res.body.joinerPb).toBe(step2.pb.toString());
    expect(res.body.joinerQb).toBe(step2.qb.toString());
  });

  it('exposes creator Step 3 values after respond', async () => {
    const app = createApp();
    const { id, step1 } = await createRoom(app);
    const { step2 } = await joinRoom(app, id, step1);
    const { step3 } = await respondRoom(app, id, step1, step2);

    const res = await request(app).get(`/api/rooms/${id}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('creator_verified');
    expect(res.body.creatorPa).toBe(step3.pa.toString());
    expect(res.body.creatorQa).toBe(step3.qa.toString());
    expect(res.body.creatorRa).toBe(step3.ra.toString());
  });

  it('returns 404 for unknown room', async () => {
    const app = createApp();
    const res = await request(app).get('/api/rooms/doesnotexist/status');
    expect(res.status).toBe(404);
  });
});

// ── Full 4-step flow ──────────────────────────────────────────────────────────

describe('Full SMP flow', () => {
  it('state machine advances correctly through all 4 steps', async () => {
    const app = createApp();

    // Step 1 – create
    const { id, step1 } = await createRoom(app);
    expect((await request(app).get(`/api/rooms/${id}/status`)).body.status).toBe('waiting');

    // Step 2 – join
    const { step2 } = await joinRoom(app, id, step1);
    expect((await request(app).get(`/api/rooms/${id}/status`)).body.status).toBe('joiner_submitted');

    // Step 3 – respond
    await respondRoom(app, id, step1, step2);
    expect((await request(app).get(`/api/rooms/${id}/status`)).body.status).toBe('creator_verified');

    // Step 4 – complete
    const completeRes = await request(app).post(`/api/rooms/${id}/complete`).send({ joinerRb: '1' });
    expect(completeRes.status).toBe(200);
    expect((await request(app).get(`/api/rooms/${id}/status`)).body.status).toBe('completed');
  });
});

// ── POST /api/rooms/:id/cancel ────────────────────────────────────────────────

describe('POST /api/rooms/:id/cancel', () => {
  it('cancels a room and subsequent status returns 404', async () => {
    const app = createApp();
    const { id } = await createRoom(app);

    const cancelRes = await request(app).post(`/api/rooms/${id}/cancel`);
    expect(cancelRes.status).toBe(200);

    const statusRes = await request(app).get(`/api/rooms/${id}/status`);
    expect(statusRes.status).toBe(404);
  });
});
