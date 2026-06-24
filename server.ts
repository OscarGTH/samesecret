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

  // SMP Protocol Values (all PUBLIC, derived from private keys)
  creatorG2a?: string;  // g^(a2)
  creatorG3a?: string;  // g^(a3)
  creatorPa?: string;   // Creator's proof Pa
  creatorQa?: string;   // Creator's proof Qa
  creatorRa?: string;   // Creator's final proof Ra

  joinerG2b?: string;   // g^(b2)
  joinerG3b?: string;   // g^(b3)
  joinerPb?: string;    // Joiner's proof Pb
  joinerQb?: string;    // Joiner's proof Qb
  joinerRb?: string;    // Joiner's final proof Rb

  caseSensitive: boolean;
  ignoreWhitespace: boolean;
  selfDestruct: boolean;
  createdAt: number;
  status: 'waiting' | 'joiner_submitted' | 'creator_verified' | 'completed';
  joinerName?: string;
  templateConfig?: Record<string, any>;
}

function generateAccessCode(rooms: Map<string, DBConfig>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

  // 1. Create Room (Creator sends Step 1 public values)
  app.post('/api/rooms', (req, res) => {
    try {
      const {
        question,
        template,
        creatorName,
        creatorG2a,
        creatorG3a,
        caseSensitive,
        ignoreWhitespace,
        selfDestruct,
        templateConfig,
      } = req.body;

      if (!question || !creatorName || !creatorG2a || !creatorG3a) {
        res.status(400).json({ error: 'Missing required creation fields.' });
        return;
      }

      if (typeof creatorG2a !== 'string' || creatorG2a.length > 512 ||
          typeof creatorG3a !== 'string' || creatorG3a.length > 512) {
        res.status(400).json({ error: 'Invalid SMP values.' });
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
        creatorG2a,
        creatorG3a,
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

  // 2. Fetch Room Info
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
        creatorG2a: room.creatorG2a,
        creatorG3a: room.creatorG3a,
        joinerG2b: room.joinerG2b,
        joinerG3b: room.joinerG3b,
        templateConfig: room.templateConfig,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Joiner Submits Step 2 Values
  app.post('/api/rooms/:idOrCode/join', (req, res) => {
    try {
      const param = req.params.idOrCode.toUpperCase();
      const { name, joinerG2b, joinerG3b, joinerPb, joinerQb } = req.body;

      if (!name || !joinerG2b || !joinerG3b || !joinerPb || !joinerQb) {
        res.status(400).json({ error: 'Missing required joiner SMP values.' });
        return;
      }

      if (typeof joinerG2b !== 'string' || joinerG2b.length > 512 ||
          typeof joinerG3b !== 'string' || joinerG3b.length > 512 ||
          typeof joinerPb !== 'string' || joinerPb.length > 512 ||
          typeof joinerQb !== 'string' || joinerQb.length > 512) {
        res.status(400).json({ error: 'Invalid SMP values.' });
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
        res.status(400).json({ error: `This Check Room has already ended. Status: ${room.status}` });
        return;
      }

      room.status = 'joiner_submitted';
      room.joinerName = name.trim();
      room.joinerG2b = joinerG2b;
      room.joinerG3b = joinerG3b;
      room.joinerPb = joinerPb;
      room.joinerQb = joinerQb;

      res.json({ success: true, status: room.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Creator Submits Step 3 Values (Pa, Qa, Ra)
  app.post('/api/rooms/:roomId/respond', (req, res) => {
    try {
      const { creatorPa, creatorQa, creatorRa } = req.body;
      const room = rooms.get(req.params.roomId);

      if (!room) {
        res.status(404).json({ error: 'Secret Check Room not found or has expired.' });
        return;
      }

      if (room.status !== 'joiner_submitted') {
        res.status(400).json({ error: `Room not ready for creator response. Status: ${room.status}` });
        return;
      }

      if (!creatorPa || !creatorQa || !creatorRa) {
        res.status(400).json({ error: 'Missing creator SMP response values.' });
        return;
      }

      room.creatorPa = creatorPa;
      room.creatorQa = creatorQa;
      room.creatorRa = creatorRa;
      room.status = 'creator_verified';

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Joiner Submits Step 4 Value (Rb) and marks completed
  app.post('/api/rooms/:roomId/complete', (req, res) => {
    try {
      const { joinerRb } = req.body;
      const room = rooms.get(req.params.roomId);

      if (!room) {
        res.status(404).json({ error: 'Secret Check Room not found or has expired.' });
        return;
      }

      if (room.status !== 'creator_verified') {
        res.status(400).json({ error: `Room not ready for completion. Status: ${room.status}` });
        return;
      }

      if (!joinerRb) {
        res.status(400).json({ error: 'Missing joiner final proof.' });
        return;
      }

      room.joinerRb = joinerRb;
      room.status = 'completed';

      res.json({ success: true });

      if (room.selfDestruct) {
        const roomId = room.id;
        setTimeout(() => rooms.delete(roomId), 10000);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Poll Status (returns all public values for client-side verification)
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
        creatorG2a: room.creatorG2a,
        creatorG3a: room.creatorG3a,
        creatorPa: room.creatorPa,
        creatorQa: room.creatorQa,
        creatorRa: room.creatorRa,
        joinerG2b: room.joinerG2b,
        joinerG3b: room.joinerG3b,
        joinerPb: room.joinerPb,
        joinerQb: room.joinerQb,
        joinerRb: room.joinerRb,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Cancel Room
  app.post('/api/rooms/:roomId/cancel', (req, res) => {
    try {
      const room = rooms.get(req.params.roomId);
      if (room) {
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

if (!process.env.VITEST) startServer();
