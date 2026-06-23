/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

interface DBConfig {
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
}

// In-memory highly volatile secure key-value store
const rooms = new Map<string, DBConfig>();

// Helper to generate a unique random uppercase 6-character access code
function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing 0, O, 1, I
  let code = '';
  // Avoid code collision
  for (let attempt = 0; attempt < 100; attempt++) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if code is already active
    const exists = Array.from(rooms.values()).some((r) => r.accessCode === code && r.status === 'waiting');
    if (!exists) break;
  }
  return code;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Clean obsolete rooms (after 24 hours) every 15 minutes
  setInterval(() => {
    const now = Date.now();
    const expiry = 24 * 60 * 60 * 1000; // 24 hours
    for (const [roomId, room] of rooms.entries()) {
      if (now - room.createdAt > expiry) {
        rooms.delete(roomId);
      }
    }
  }, 15 * 60 * 1000);

  // 1. Create a secure Room
  app.post('/api/rooms', (req, res) => {
    try {
      const { question, template, creatorName, creatorSmpA, caseSensitive, ignoreWhitespace, selfDestruct } = req.body;

      if (!question || !creatorName || !creatorSmpA) {
         res.status(400).json({ error: 'Missing required creation fields.' });
         return;
      }

      const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const accessCode = generateAccessCode();

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
      // Match by room ID or access code
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
        creatorSmpA: room.creatorSmpA, // Send A so joiner can cross-blind it
        joinerSmpB: room.joinerSmpB,
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

      room.creatorSmpCA = creatorSmpCA;
      
      // Perform SMP final match evaluation!
      // CA (H_B ^ ba) is compared to CB (H_A ^ ab).
      // Under Socialist Millionaire, if H_A === H_B, they are mathematically identical.
      const isMatch = room.joinerSmpCB === creatorSmpCA;

      room.status = isMatch ? 'matched' : 'no_match';

      res.json({ success: true, match: isMatch });

      // If selfDestruct is flagged, wait 10 seconds then delete room
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
        joinerSmpB: room.joinerSmpB, // Send B back to Creator so she can compute CA
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

  // Vite Integration & Static Assets
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
