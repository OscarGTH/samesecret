import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, DBConfig } from './server';
import { modPow, P } from './src/utils/smp';

// Simulate SMP values using small hardcoded exponents (fast, deterministic)
function makeSmpValues(hA: bigint, a: bigint, hB: bigint, b: bigint) {
  const A = modPow(hA, a, P);
  const B = modPow(hB, b, P);
  const C_A = modPow(B, a, P); // creator's finalize value
  const C_B = modPow(A, b, P); // joiner's cross-blind value
  return { A, B, C_A, C_B };
}

const SAME_SECRET_H = 4n;   // H_A === H_B (secrets match)
const DIFF_SECRET_H = 9n;   // H_B differs (secrets don't match)
const PRIVATE_A = 7919n;
const PRIVATE_B = 6271n;

describe('POST /api/rooms', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { app = createApp(); });

  it('creates a room and returns id, accessCode, question', async () => {
    const { A } = makeSmpValues(SAME_SECRET_H, PRIVATE_A, SAME_SECRET_H, PRIVATE_B);
    const res = await request(app).post('/api/rooms').send({
      question: 'Who do you think should lead the project?',
      template: 'Custom',
      creatorName: 'Alice',
      creatorSmpA: A.toString(),
      caseSensitive: false,
      ignoreWhitespace: true,
      selfDestruct: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id).toBeTruthy();
    expect(res.body.accessCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body.question).toBe('Who do you think should lead the project?');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/rooms').send({ question: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/rooms/:idOrCode', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => { app = createApp(); });

  async function createRoom(a: ReturnType<typeof createApp>) {
    const { A } = makeSmpValues(SAME_SECRET_H, PRIVATE_A, SAME_SECRET_H, PRIVATE_B);
    const res = await request(a).post('/api/rooms').send({
      question: 'Secret Q',
      template: 'Custom',
      creatorName: 'Alice',
      creatorSmpA: A.toString(),
      caseSensitive: false,
      ignoreWhitespace: true,
      selfDestruct: false,
    });
    return res.body;
  }

  it('fetches room by ID', async () => {
    const created = await createRoom(app);
    const res = await request(app).get(`/api/rooms/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.status).toBe('waiting');
  });

  it('fetches room by access code', async () => {
    const created = await createRoom(app);
    const res = await request(app).get(`/api/rooms/${created.accessCode}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it('returns 404 for unknown room', async () => {
    const res = await request(app).get('/api/rooms/notexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/rooms/:id/join', () => {
  let app: ReturnType<typeof createApp>;
  let roomId: string;
  let smp: ReturnType<typeof makeSmpValues>;

  beforeEach(async () => {
    app = createApp();
    smp = makeSmpValues(SAME_SECRET_H, PRIVATE_A, SAME_SECRET_H, PRIVATE_B);
    const res = await request(app).post('/api/rooms').send({
      question: 'Test Q',
      template: 'Custom',
      creatorName: 'Alice',
      creatorSmpA: smp.A.toString(),
      caseSensitive: false,
      ignoreWhitespace: true,
      selfDestruct: false,
    });
    roomId = res.body.id;
  });

  it('joiner can submit B and CB, status becomes joiner_submitted', async () => {
    const res = await request(app).post(`/api/rooms/${roomId}/join`).send({
      name: 'Bob',
      joinerSmpB: smp.B.toString(),
      joinerSmpCB: smp.C_B.toString(),
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('joiner_submitted');
  });

  it('returns 400 when required join fields are missing', async () => {
    const res = await request(app).post(`/api/rooms/${roomId}/join`).send({ name: 'Bob' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when joining a room that already has a joiner', async () => {
    await request(app).post(`/api/rooms/${roomId}/join`).send({
      name: 'Bob',
      joinerSmpB: smp.B.toString(),
      joinerSmpCB: smp.C_B.toString(),
    });
    const res = await request(app).post(`/api/rooms/${roomId}/join`).send({
      name: 'Charlie',
      joinerSmpB: smp.B.toString(),
      joinerSmpCB: smp.C_B.toString(),
    });
    expect(res.status).toBe(400);
  });
});

describe('Full SMP flow: match', () => {
  it('both parties share the same secret → finalize returns match=true, status=matched', async () => {
    const app = createApp();
    const smp = makeSmpValues(SAME_SECRET_H, PRIVATE_A, SAME_SECRET_H, PRIVATE_B);

    // 1. Creator creates room
    const createRes = await request(app).post('/api/rooms').send({
      question: 'Shared secret question',
      template: 'Custom',
      creatorName: 'Alice',
      creatorSmpA: smp.A.toString(),
      caseSensitive: false,
      ignoreWhitespace: true,
      selfDestruct: false,
    });
    expect(createRes.status).toBe(200);
    const { id } = createRes.body;

    // 2. Joiner submits their values
    const joinRes = await request(app).post(`/api/rooms/${id}/join`).send({
      name: 'Bob',
      joinerSmpB: smp.B.toString(),
      joinerSmpCB: smp.C_B.toString(),
    });
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.status).toBe('joiner_submitted');

    // 3. Creator polls status and retrieves B
    const statusRes = await request(app).get(`/api/rooms/${id}/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('joiner_submitted');
    expect(statusRes.body.joinerSmpB).toBe(smp.B.toString());

    // 4. Creator finalizes with C_A
    const finalizeRes = await request(app).post(`/api/rooms/${id}/finalize`).send({
      creatorSmpCA: smp.C_A.toString(),
    });
    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.match).toBe(true);

    // 5. Status endpoint reflects matched
    const finalStatus = await request(app).get(`/api/rooms/${id}/status`);
    expect(finalStatus.body.status).toBe('matched');
  });
});

describe('Full SMP flow: no match', () => {
  it('parties have different secrets → finalize returns match=false, status=no_match', async () => {
    const app = createApp();
    // Alice uses SAME_SECRET_H, Bob uses DIFF_SECRET_H → C_A ≠ C_B
    const smpAlice = makeSmpValues(SAME_SECRET_H, PRIVATE_A, SAME_SECRET_H, PRIVATE_B);
    const smpBob = makeSmpValues(DIFF_SECRET_H, PRIVATE_B, SAME_SECRET_H, PRIVATE_A);

    const createRes = await request(app).post('/api/rooms').send({
      question: 'Mismatch question',
      template: 'Custom',
      creatorName: 'Alice',
      creatorSmpA: smpAlice.A.toString(),
      caseSensitive: false,
      ignoreWhitespace: true,
      selfDestruct: false,
    });
    const { id } = createRes.body;

    // Bob joins with C_B derived from a DIFFERENT secret hash
    const bobB = modPow(DIFF_SECRET_H, PRIVATE_B, P);
    const bobC_B = modPow(smpAlice.A, PRIVATE_B, P); // Bob blinds Alice's A with his key...
    // ...but Alice's C_A = B^a = (H_B_bob^b)^a ≠ A^b when H_A ≠ H_B
    const aliceC_A = modPow(bobB, PRIVATE_A, P);

    await request(app).post(`/api/rooms/${id}/join`).send({
      name: 'Bob',
      joinerSmpB: bobB.toString(),
      joinerSmpCB: bobC_B.toString(),
    });

    const finalizeRes = await request(app).post(`/api/rooms/${id}/finalize`).send({
      creatorSmpCA: aliceC_A.toString(),
    });
    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.match).toBe(false);

    const statusRes = await request(app).get(`/api/rooms/${id}/status`);
    expect(statusRes.body.status).toBe('no_match');
  });
});

describe('POST /api/rooms/:id/cancel', () => {
  it('cancels a room and subsequent status returns 404', async () => {
    const app = createApp();
    const { A } = makeSmpValues(SAME_SECRET_H, PRIVATE_A, SAME_SECRET_H, PRIVATE_B);
    const createRes = await request(app).post('/api/rooms').send({
      question: 'To be cancelled',
      template: 'Custom',
      creatorName: 'Alice',
      creatorSmpA: A.toString(),
      caseSensitive: false,
      ignoreWhitespace: false,
      selfDestruct: false,
    });
    const { id } = createRes.body;

    const cancelRes = await request(app).post(`/api/rooms/${id}/cancel`);
    expect(cancelRes.status).toBe(200);

    const statusRes = await request(app).get(`/api/rooms/${id}/status`);
    expect(statusRes.status).toBe(404);
  });
});
