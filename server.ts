/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';

export interface DBConfig {
  id: string;
  accessCode: string;
  question: string;
  template: 'Person' | 'Project' | 'Date' | 'Email' | 'Number' | 'Custom';
  creatorName: string;
  creatorSmpA: string; // Alice's public blinded key A
  joinerSmpB?: string; // Bob's public blinded key B
  joinerSmpCB?: string; // Bob's cross-blinded key CB
  creatorSmpCA?: string; // Alice's cross-blinded key CA
  caseSensitive: boolean;
  ignoreWhitespace: boolean;
  selfDestruct: boolean;
  createdAt: number;
  status: 'waiting' | 'joiner_submitted' | 'matched' | 'no_match' | 'cancelled';
  joinerName?: string;
  templateConfig?: Record<string, any>;
}

function generateAccessCode(rooms: Map<string, DBConfig>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing 0, O, 1, I
  let code = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const exists = Array.from(rooms.values()).some((r) => r.accessCode === code && r.status === 'waiting');
    if (!exists) break;
  }
  return code;
}

export function createApp(rooms: Map<string, DBConfig> = new Map()) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));

  // CORS must be registered before the rate limiter so 429 responses still carry the header
  const allowedRaw = process.env.ALLOWED_ORIGINS || process.env.APP_URL || '';
  const allowedOrigins = allowedRaw.split(',').map(s => s.trim()).filter(Boolean);
  const corsOptions = allowedOrigins.length > 0
    ? { origin: (origin: string | undefined) => !origin || allowedOrigins.includes(origin), maxAge: 86400 }
    : { origin: true, maxAge: 86400 };
  app.use(cors(corsOptions));

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', apiLimiter);

  // 1. Create a secure Room
  app.post('/api/rooms', (req, res) => {
    try {
      const { question, template, creatorName, creatorSmpA, caseSensitive, ignoreWhitespace, selfDestruct, templateConfig } = req.body;

      if (!question || !creatorName || !creatorSmpA) {
        res.status(400).json({ error: 'Missing required creation fields.' });
        return;
      }
      if (typeof creatorSmpA !== 'string' || creatorSmpA.length > 512) {
        res.status(400).json({ error: 'Invalid SMP key.' });
        return;
      }

      const id = randomUUID().replace(/-/g, '');
      const accessCode = generateAccessCode(rooms);

      const newRoom: DBConfig = {
        id,
        accessCode,
        question: question.trim(),
        template: template || 'Custom',
        creatorName: creatorName.trim(),
        creatorSmpA,
        caseSensitive: !!caseSensitive,
        ignoreWhitespace: !!ignoreWhitespace,
        selfDestruct: !!selfDestruct,
        createdAt: Date.now(),
        status: 'waiting',
        templateConfig: templateConfig || undefined,
      };

      rooms.set(id, newRoom);
      res.json({ success: true, id, accessCode, question: newRoom.question });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Fetch secure Room info
  app.get('/api/rooms/:idOrCode', (req, res) => {
    try {
      const param = req.params.idOrCode.toUpperCase();
      let room = rooms.get(req.params.idOrCode);
      if (!room) {
        room = Array.from(rooms.values()).find((r) => r.accessCode === param);
      }

      if (!room) {
        res.status(404).json({ error: 'Secret Check Room not found or has expired.' });
        return;
      }

      res.json({
        id: room.id,
        accessCode: room.accessCode,
        question: room.question,
        template: room.template,
        caseSensitive: room.caseSensitive,
        ignoreWhitespace: room.ignoreWhitespace,
        selfDestruct: room.selfDestruct,
        status: room.status,
        creatorName: room.creatorName,
        joinerName: room.joinerName,
        creatorSmpA: room.creatorSmpA,
        joinerSmpB: room.joinerSmpB,
        templateConfig: room.templateConfig,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Participate / Submit Joiner SMP (Step 2)
  app.post('/api/rooms/:idOrCode/join', (req, res) => {
    try {
      const param = req.params.idOrCode.toUpperCase();
      const { name, joinerSmpB, joinerSmpCB } = req.body;

      if (!name || !joinerSmpB || !joinerSmpCB) {
        res.status(400).json({ error: 'Name, public blinded value (B), and cross-blinded value (CB) are mandatory.' });
        return;
      }
      if (typeof joinerSmpB !== 'string' || joinerSmpB.length > 512 ||
          typeof joinerSmpCB !== 'string' || joinerSmpCB.length > 512) {
        res.status(400).json({ error: 'Invalid SMP key.' });
        return;
      }

      let room = rooms.get(req.params.idOrCode);
      if (!room) {
        room = Array.from(rooms.values()).find((r) => r.accessCode === param);
      }

      if (!room) {
        res.status(404).json({ error: 'Secret Check Room not found or has expired.' });
        return;
      }

      if (room.status !== 'waiting') {
        res.status(400).json({ error: `This Check Room has already ended or is processing. Status: ${room.status}` });
        return;
      }

      room.status = 'joiner_submitted';
      room.joinerName = name.trim();
      room.joinerSmpB = joinerSmpB;
      room.joinerSmpCB = joinerSmpCB;

      res.json({ success: true, status: room.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Finalize SMP match verification (Called by Creator with CA)
  app.post('/api/rooms/:roomId/finalize', (req, res) => {
    try {
      const { creatorSmpCA } = req.body;
      const room = rooms.get(req.params.roomId);

      if (!room) {
        res.status(404).json({ error: 'Secret Check Room not found or has expired.' });
        return;
      }

      if (room.status !== 'joiner_submitted') {
        res.status(400).json({ error: `Room is not in joiner_submitted state. Status: ${room.status}` });
        return;
      }

      if (!creatorSmpCA) {
        res.status(400).json({ error: 'creatorSmpCA is mandatory for finalization.' });
        return;
      }
      if (typeof creatorSmpCA !== 'string' || creatorSmpCA.length > 512) {
        res.status(400).json({ error: 'Invalid SMP key.' });
        return;
      }

      room.creatorSmpCA = creatorSmpCA;

      // CA = B^a = (H_B^b)^a = H_B^(ab); CB = A^b = (H_A^a)^b = H_A^(ab)
      // They are equal iff H_A === H_B, i.e. secrets match.
      const isMatch = room.joinerSmpCB === creatorSmpCA;

      room.status = isMatch ? 'matched' : 'no_match';

      res.json({ success: true, match: isMatch });

      if (room.selfDestruct) {
        const roomId = room.id;
        setTimeout(() => {
          rooms.delete(roomId);
        }, 10000);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Poll active room status
  app.get('/api/rooms/:roomId/status', (req, res) => {
    try {
      const room = rooms.get(req.params.roomId);
      if (!room) {
        res.status(404).json({ error: 'Secret Check Session expired or self-destructed.' });
        return;
      }

      res.json({
        status: room.status,
        creatorName: room.creatorName,
        joinerName: room.joinerName,
        joinerSmpB: room.joinerSmpB,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Explicitly sever / cancel a Room
  app.post('/api/rooms/:roomId/cancel', (req, res) => {
    try {
      const room = rooms.get(req.params.roomId);
      if (room) {
        room.status = 'cancelled';
        rooms.delete(req.params.roomId);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

async function startServer() {
  const rooms = new Map<string, DBConfig>();
  const app = createApp(rooms);
  const PORT = 3000;

  // Clean obsolete rooms (after 24 hours) every 15 minutes
  setInterval(() => {
    const now = Date.now();
    const expiry = 24 * 60 * 60 * 1000;
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.createdAt > expiry) {
        rooms.delete(roomId);
      }
    }
  }, 15 * 60 * 1000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[samesecret Server] Listening securely on http://localhost:${PORT}`);
  });
}

startServer();
