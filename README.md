# Collaborative Document Editor

A real-time collaborative document editor that allows multiple users to edit documents simultaneously.

## Tech Stack

- **Frontend**: React + Vite + Yjs
- **Backend**: Node.js + Express
- **Database**: SQLite (local file)
- **Real-time Sync**: Yjs (CRDT) + WebSocket

All packages are MIT licensed or open-source and free to use.

## Features

- ? Real-time collaborative editing
- ?? Automatic saving to local SQLite database
- ?? Multiple document management
- ?? Offline support (auto-sync on reconnect)
- ?? Docker support for easy setup

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed

### Run with Docker

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

### Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- WebSocket: ws://localhost:1234

### Stop the Services

```bash
docker-compose down
```

## Local Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

```bash
# Install all dependencies
npm run install:all
```

### Run Development Servers

```bash
# Start both backend and frontend simultaneously
npm run dev
```

Or start them individually:

```bash
# Backend server (port 3001, WebSocket port 1234)
npm run dev:server

# Frontend (port 5173)
npm run dev:client
```

## Usage

1. Open http://localhost:5173 in your browser
2. Click "+ New Document" to create a new document
3. Select a document from the sidebar to start editing
4. Open the same document in multiple browser tabs to see real-time collaboration

## Project Structure

```
collaborative-editor-sample/
??? client/          # React frontend
?   ??? src/
?   ?   ??? components/
?   ?   ?   ??? Editor.jsx
?   ?   ?   ??? DocumentList.jsx
?   ?   ??? App.jsx
?   ?   ??? main.jsx
?   ??? Dockerfile
?   ??? package.json
??? server/          # Express backend
?   ??? index.js
?   ??? Dockerfile
?   ??? package.json
?   ??? database.db  # SQLite database (auto-created)
??? docker-compose.yml
??? package.json
```

## How It Works

1. **Yjs (CRDT)**: Uses Conflict-free Replicated Data Types to handle simultaneous edits without conflicts
2. **WebSocket**: Real-time synchronization between clients
3. **SQLite**: Persistent storage for documents
4. **React**: Modern UI framework for the frontend

## License

MIT License - All code is free to use, modify, and distribute.
