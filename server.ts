import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface RegisteredPeer {
  clientId: string;
  phone: string;
  normalizedPhone: string;
  name: string;
  ws: WebSocket;
  connectedAt: number;
}

function normalizePhone(raw: string): string {
  return (raw || '').replace(/[^\d]/g, '').slice(-10) || (raw || '').replace(/[^\d+]/g, '');
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/signaling' });

  const clientsById = new Map<string, RegisteredPeer>();

  function getOnlinePeersList() {
    const seenPhones = new Set<string>();
    const list: { clientId: string; phone: string; name: string; connectedAt: number }[] = [];
    clientsById.forEach((peer) => {
      if (peer.ws.readyState === WebSocket.OPEN && peer.normalizedPhone && !seenPhones.has(peer.normalizedPhone)) {
        seenPhones.add(peer.normalizedPhone);
        list.push({
          clientId: peer.clientId,
          phone: peer.phone,
          name: peer.name,
          connectedAt: peer.connectedAt
        });
      }
    });
    return list;
  }

  function broadcastOnlinePeers() {
    const peers = getOnlinePeersList();
    const payload = JSON.stringify({
      type: 'ONLINE_PEERS',
      peers,
      timestamp: Date.now()
    });
    clientsById.forEach((peer) => {
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(payload);
      }
    });
  }

  function findPeerByPhone(targetPhone: string, excludeClientId?: string): RegisteredPeer | undefined {
    const targetNorm = normalizePhone(targetPhone);
    if (!targetNorm) return undefined;
    for (const peer of clientsById.values()) {
      if (peer.clientId === excludeClientId) continue;
      if (peer.ws.readyState !== WebSocket.OPEN) continue;
      if (peer.normalizedPhone === targetNorm || peer.phone.replace(/[^\d]/g, '') === targetPhone.replace(/[^\d]/g, '')) {
        return peer;
      }
    }
    return undefined;
  }

  wss.on('connection', (ws) => {
    const clientId = `peer-${Math.random().toString(36).substring(2, 8)}-${Date.now().toString(36)}`;
    clientsById.set(clientId, {
      clientId,
      phone: '',
      normalizedPhone: '',
      name: 'App User',
      ws,
      connectedAt: Date.now()
    });

    ws.send(JSON.stringify({
      type: 'WELCOME',
      clientId,
      peers: getOnlinePeersList(),
      timestamp: Date.now()
    }));

    ws.on('message', (rawData) => {
      let msg: any;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      const sender = clientsById.get(clientId);
      if (!sender) return;

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        return;
      }

      if (msg.type === 'REGISTER_NUMBER') {
        const cleanPhone = String(msg.phone || '').trim();
        const cleanName = String(msg.name || 'Original Call User').trim();
        sender.phone = cleanPhone;
        sender.normalizedPhone = normalizePhone(cleanPhone);
        sender.name = cleanName;
        ws.send(JSON.stringify({
          type: 'REGISTERED',
          clientId,
          phone: sender.phone,
          normalizedPhone: sender.normalizedPhone,
          name: sender.name,
          timestamp: Date.now()
        }));
        broadcastOnlinePeers();
        return;
      }

      if (msg.type === 'CALL_OFFER') {
        const targetPhone = String(msg.targetNumber || '').trim();
        const targetPeer = msg.targetClientId
          ? clientsById.get(msg.targetClientId)
          : findPeerByPhone(targetPhone, clientId);

        if (!targetPeer || targetPeer.ws.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'CALL_PEER_OFFLINE',
            callId: msg.callId,
            targetNumber: targetPhone,
            reason: `Number ${targetPhone} is not currently online in RoboVoiceCall. Ask the recipient to open this app link and register ${targetPhone} under My Number, or switch to Agora Live Channel / Server SIP.`,
            timestamp: Date.now()
          }));
          return;
        }

        // Deliver genuine incoming call screen offer to target peer
        targetPeer.ws.send(JSON.stringify({
          type: 'INCOMING_CALL',
          callId: msg.callId,
          fromClientId: clientId,
          callerNumber: msg.callerNumber || sender.phone || 'Unknown Caller',
          callerName: msg.callerName || sender.name || 'Incoming Caller',
          targetNumber: targetPhone,
          sdp: msg.sdp,
          timestamp: Date.now()
        }));

        // Notify caller that remote device is actively ringing
        ws.send(JSON.stringify({
          type: 'CALL_RINGING',
          callId: msg.callId,
          targetClientId: targetPeer.clientId,
          targetNumber: targetPhone,
          targetName: targetPeer.name,
          timestamp: Date.now()
        }));
        return;
      }

      if (msg.type === 'CALL_ANSWER') {
        const callerPeer = msg.toClientId ? clientsById.get(msg.toClientId) : undefined;
        if (callerPeer && callerPeer.ws.readyState === WebSocket.OPEN) {
          callerPeer.ws.send(JSON.stringify({
            type: 'CALL_ANSWER',
            callId: msg.callId,
            fromClientId: clientId,
            answererNumber: sender.phone,
            answererName: sender.name,
            sdp: msg.sdp,
            timestamp: Date.now()
          }));
        }
        return;
      }

      if (msg.type === 'CALL_REJECT') {
        const callerPeer = msg.toClientId ? clientsById.get(msg.toClientId) : undefined;
        if (callerPeer && callerPeer.ws.readyState === WebSocket.OPEN) {
          callerPeer.ws.send(JSON.stringify({
            type: 'CALL_REJECT',
            callId: msg.callId,
            fromClientId: clientId,
            reason: msg.reason || 'Call declined by recipient.',
            timestamp: Date.now()
          }));
        }
        return;
      }

      if (msg.type === 'CALL_END') {
        const targetPeer = msg.targetClientId
          ? clientsById.get(msg.targetClientId)
          : (msg.targetNumber ? findPeerByPhone(String(msg.targetNumber), clientId) : undefined);

        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(JSON.stringify({
            type: 'CALL_END',
            callId: msg.callId,
            fromClientId: clientId,
            timestamp: Date.now()
          }));
        }
        return;
      }

      if (msg.type === 'ICE_CANDIDATE') {
        const targetPeer = msg.targetClientId
          ? clientsById.get(msg.targetClientId)
          : (msg.targetNumber ? findPeerByPhone(String(msg.targetNumber), clientId) : undefined);

        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(JSON.stringify({
            type: 'ICE_CANDIDATE',
            callId: msg.callId,
            fromClientId: clientId,
            candidate: msg.candidate,
            timestamp: Date.now()
          }));
        }
      }
    });

    ws.on('close', () => {
      clientsById.delete(clientId);
      broadcastOnlinePeers();
    });

    ws.on('error', () => {
      clientsById.delete(clientId);
      broadcastOnlinePeers();
    });
  });

  // Health & Live Directory Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'RoboVoice Original Voice & WebRTC Signaling Server',
      onlinePeers: getOnlinePeersList().length,
      pstnConfigured: Boolean(process.env.VONAGE_API_KEY || process.env.TWILIO_ACCOUNT_SID)
    });
  });

  app.get('/api/peers', (_req, res) => {
    res.json({ peers: getOnlinePeersList() });
  });

  // Genuine server-side PSTN outbound bridge (only works when real Twilio or Vonage credentials are provided)
  app.post('/api/calls/outbound', async (req, res) => {
    const { targetNumber, callerNumber, callerName } = req.body || {};
    if (!targetNumber) {
      res.status(400).json({ error: 'Target phone number is required.' });
      return;
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER || callerNumber;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const params = new URLSearchParams({
          To: String(targetNumber).replace(/[^\d+]/g, ''),
          From: String(twilioFrom).replace(/[^\d+]/g, ''),
          Twiml: `<Response><Say>Original live voice connection from ${String(callerName || 'RoboVoiceCall')}.</Say></Response>`
        });
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
        const data: any = await resp.json();
        if (!resp.ok) {
          res.status(resp.status).json({ error: data?.message || 'Twilio API error' });
          return;
        }
        res.json({ ok: true, provider: 'twilio', callUuid: data.sid, status: data.status || 'queued' });
        return;
      } catch (err: any) {
        res.status(502).json({ error: `Twilio request failed: ${err?.message || 'Network error'}` });
        return;
      }
    }

    res.status(400).json({
      error: 'No real PSTN carrier credentials (TWILIO_ACCOUNT_SID / VONAGE_API_KEY) configured on server. Use In-App WebRTC P2P Call (ring another open device/tab in this app) or Agora Live Channel for real two-way original voice.'
    });
  });

  const distPath = path.resolve(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProduction) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ready at http://0.0.0.0:${PORT} (WebSocket signaling at /ws/signaling)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
