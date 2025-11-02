import express from 'express';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import Database from 'better-sqlite3';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;
const WS_PORT = 1234;

// CORS configuration
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbDir = process.env.DB_DIR || __dirname;
const dbPath = join(dbDir, 'database.db');
const db = new Database(dbPath);

// Create documents table
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Store Yjs documents in memory
const docs = new Map();
const awareness = new Map();

function getDocument(docId) {
  if (!docs.has(docId)) {
    const doc = new Y.Doc();
    
    // Load from database
    const stmt = db.prepare('SELECT content FROM documents WHERE id = ?');
    const row = stmt.get(docId);
    
    if (row && row.content) {
      try {
        Y.applyUpdate(doc, row.content);
      } catch (e) {
        console.error('Failed to apply update:', e);
      }
    } else {
      // Create new document
      db.prepare('INSERT OR IGNORE INTO documents (id, title) VALUES (?, ?)')
        .run(docId, `Document ${docId}`);
    }
    
    // Watch for changes and save to database
    doc.on('update', (update) => {
      db.prepare('UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(Buffer.from(update), docId);
    });
    
    docs.set(docId, doc);
    awareness.set(docId, new Map());
  }
  return docs.get(docId);
}

// REST API - List documents
app.get('/api/documents', (req, res) => {
  const stmt = db.prepare('SELECT id, title, created_at, updated_at FROM documents ORDER BY updated_at DESC');
  const documents = stmt.all();
  res.json(documents);
});

// REST API - Create document
app.post('/api/documents', (req, res) => {
  const { id, title } = req.body;
  const docId = id || `doc-${Date.now()}`;
  
  db.prepare('INSERT INTO documents (id, title) VALUES (?, ?)')
    .run(docId, title || `New Document`);
  
  res.json({ id: docId, title: title || `New Document` });
});

// REST API - Delete document
app.delete('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  docs.delete(id);
  awareness.delete(id);
  res.json({ success: true });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Start WebSocket server
const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });

wss.on('connection', (ws, req) => {
  // Extract document ID from URL (e.g., ws://localhost:1234?doc=doc-123)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const docId = url.searchParams.get('doc') || 'default';
  
  const doc = getDocument(docId);
  const docAwareness = awareness.get(docId);
  
  let synced = false;
  
  // Send initial sync
  const encoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(Buffer.from(encoding.toUint8Array(encoder)));
  
  // Broadcast updates to other clients
  const broadcastUpdate = (update, origin) => {
    if (origin !== ws) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); // sync message type
      syncProtocol.writeUpdate(encoder, update);
      ws.send(Buffer.from(encoding.toUint8Array(encoder)));
    }
  };
  
  // Broadcast awareness updates
  const broadcastAwareness = (awarenessUpdate, origin) => {
    if (origin !== ws) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1); // awareness message type
      awarenessProtocol.encodeAwarenessUpdate(encoder, awarenessUpdate);
      ws.send(Buffer.from(encoding.toUint8Array(encoder)));
    }
  };
  
  // Handle document updates
  doc.on('update', (update, origin) => {
    broadcastUpdate(update, origin);
  });
  
  // Handle WebSocket messages
  ws.on('message', (message) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const messageType = decoding.readVarUint(decoder);
      
      if (messageType === 0) {
        // Sync message
        syncProtocol.readSyncMessage(decoder, doc, ws);
        if (!synced) {
          // After receiving sync step 1, send sync step 2
          const encoder = encoding.createEncoder();
          syncProtocol.writeSyncStep2(encoder, doc);
          ws.send(Buffer.from(encoding.toUint8Array(encoder)));
          synced = true;
        }
      } else if (messageType === 1) {
        // Awareness message
        const awarenessUpdate = awarenessProtocol.decodeAwarenessUpdate(decoder, docAwareness);
        // Broadcast to other clients
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1);
        awarenessProtocol.encodeAwarenessUpdate(encoder, awarenessUpdate);
        // Broadcast to all other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(Buffer.from(encoding.toUint8Array(encoder)));
          }
        });
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });
  
  ws.on('close', () => {
    doc.off('update', broadcastUpdate);
    console.log(`Client disconnected from document: ${docId}`);
  });
  
  console.log(`Client connected to document: ${docId}`);
});

console.log(`WebSocket server running on ws://0.0.0.0:${WS_PORT}`);
