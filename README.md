# Collaborative Document Editor

Real-time collaborative document editor with Redis caching.

## Tech Stack

- **Frontend**: React + Vite + Tiptap (Notion-like rich text editor)
- **Backend**: Node.js + Express
- **Database**: SQLite (persistent storage)
- **Cache**: Redis (in-memory, real-time data)
- **Real-time**: Yjs (CRDT) + WebSocket

## Quick Start

```bash
# Start all services with Docker
docker-compose up --build

# Or in detached mode
docker-compose up -d --build
```

**Access:**
- Frontend: http://localhost:5173
- API: http://localhost:3001
- Redis: localhost:6380

**Stop:**
```bash
docker-compose down
```

## Local Development

```bash
# Install dependencies
npm run install:all

# Start dev servers
npm run dev
```

## Features

- ? Real-time collaborative editing
- ?? Automatic saving (SQLite)
- ? Redis caching for performance
- ?? Multiple document management
- ?? Docker support

## License

MIT License
