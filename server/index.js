import express from 'express';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
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

// Initialize Redis client
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');
const redis = new Redis({
  host: redisHost,
  port: redisPort,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`Redis connection retry, attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

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

// Redis cache keys
const CACHE_KEY_DOCUMENTS_LIST = 'documents:list';
const CACHE_KEY_DOCUMENT = (docId) => `document:${docId}`;
const CACHE_KEY_DOCUMENT_META = (docId) => `document:meta:${docId}`;
const CACHE_TTL = 300; // 5 minutes

// Helper function to invalidate document cache
async function invalidateDocumentCache(docId) {
  try {
    await redis.del(CACHE_KEY_DOCUMENTS_LIST);
    await redis.del(CACHE_KEY_DOCUMENT_META(docId));
  } catch (err) {
    console.error('Error invalidating cache:', err);
  }
}

// Helper function to get document metadata
async function getDocumentMetadata(docId) {
  try {
    const cached = await redis.get(CACHE_KEY_DOCUMENT_META(docId));
    if (cached) {
      return JSON.parse(cached);
    }
    
    const stmt = db.prepare('SELECT id, title, created_at, updated_at FROM documents WHERE id = ?');
    const row = stmt.get(docId);
    
    if (row) {
      await redis.setex(CACHE_KEY_DOCUMENT_META(docId), CACHE_TTL, JSON.stringify(row));
      return row;
    }
    return null;
  } catch (err) {
    console.error('Error getting document metadata:', err);
    const stmt = db.prepare('SELECT id, title, created_at, updated_at FROM documents WHERE id = ?');
    return stmt.get(docId);
  }
}

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
      invalidateDocumentCache(docId);
    }
    
    // Watch for changes and save to database and cache
    doc.on('update', async (update) => {
      db.prepare('UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(Buffer.from(update), docId);
      
      // Invalidate cache when document is updated
      await invalidateDocumentCache(docId);
      
      // Publish update event to Redis pub/sub for real-time notifications
      try {
        await redis.publish('document:updates', JSON.stringify({
          docId,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.error('Error publishing update:', err);
      }
    });
    
    docs.set(docId, doc);
    awareness.set(docId, new Map());
  }
  return docs.get(docId);
}

// REST API - List documents (with Redis caching)
app.get('/api/documents', async (req, res) => {
  try {
    // Try to get from cache first
    const cached = await redis.get(CACHE_KEY_DOCUMENTS_LIST);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // If not in cache, get from database
    const stmt = db.prepare('SELECT id, title, created_at, updated_at FROM documents ORDER BY updated_at DESC');
    const documents = stmt.all();
    
    // Cache the result
    await redis.setex(CACHE_KEY_DOCUMENTS_LIST, CACHE_TTL, JSON.stringify(documents));
    
    res.json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    // Fallback to database if Redis fails
    const stmt = db.prepare('SELECT id, title, created_at, updated_at FROM documents ORDER BY updated_at DESC');
    const documents = stmt.all();
    res.json(documents);
  }
});

// REST API - Get document metadata
app.get('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const metadata = await getDocumentMetadata(id);
  
  if (metadata) {
    res.json(metadata);
  } else {
    res.status(404).json({ error: 'Document not found' });
  }
});

// REST API - Create document
app.post('/api/documents', async (req, res) => {
  const { id, title } = req.body;
  const docId = id || `doc-${Date.now()}`;
  
  db.prepare('INSERT INTO documents (id, title) VALUES (?, ?)')
    .run(docId, title || `New Document`);
  
  // Invalidate cache
  await invalidateDocumentCache(docId);
  
  const newDoc = {
    id: docId,
    title: title || `New Document`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  res.json(newDoc);
});

// REST API - Delete document
app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  docs.delete(id);
  awareness.delete(id);
  
  // Invalidate cache
  await invalidateDocumentCache(id);
  
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
  
  // Remove unused broadcastAwareness function - handled in message handler
  
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
        // Awareness message - forward to other clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            // Forward the original message
            client.send(message);
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

// Subscribe to document updates via Redis pub/sub for cross-instance notifications
const subscriber = new Redis({
  host: redisHost,
  port: redisPort,
});

subscriber.subscribe('document:updates', (err) => {
  if (err) {
    console.error('Error subscribing to Redis channel:', err);
  } else {
    console.log('Subscribed to Redis document:updates channel');
  }
});

subscriber.on('message', (channel, message) => {
  if (channel === 'document:updates') {
    try {
      const update = JSON.parse(message);
      // Log document updates for monitoring
      console.log(`Document updated via Redis: ${update.docId} at ${new Date(update.timestamp).toISOString()}`);
    } catch (err) {
      console.error('Error processing Redis message:', err);
    }
  }
});

console.log(`WebSocket server running on ws://0.0.0.0:${WS_PORT}`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redis.quit();
  await subscriber.quit();
  db.close();
  process.exit(0);
});
