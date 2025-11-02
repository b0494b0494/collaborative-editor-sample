# Architecture Documentation

## System Overview

```mermaid
graph LR
    A[Client Browser] -->|HTTP/WebSocket| B[Express Server]
    B -->|Store| C[(SQLite Database)]
    B -->|Cache| D[(Redis Cache)]
    B -->|Pub/Sub| D
```

## Components Architecture

```mermaid
graph TB
    subgraph "Client Side"
        A[React App] --> B[Tiptap Editor]
        B --> C[Collaboration Extension]
        C --> D[Yjs Document]
        D --> E[WebSocketProvider]
    end
    
    subgraph "Server Side"
        E -->|WebSocket| F[WebSocket Server]
        F --> G[Yjs Sync Handler]
        G --> H[Express Server]
        H --> I[SQLite DB]
        H --> J[Redis Cache]
    end
```

## Client Side

### Editor Component
- **Tiptap**: Rich text editor framework
- **Collaboration Extension**: Yjs integration for real-time sync
- **CollaborationCursor**: Shows other users' cursors
- **WebSocketProvider**: Connects to server via WebSocket

### State Management
- Yjs Document: Source of truth for editor content
- WebSocket Provider: Handles connection and sync
- React State: UI state (connection status, etc.)

```mermaid
stateDiagram-v2
    [*] --> Initializing: Component Mount
    Initializing --> Connecting: Create Provider
    Connecting --> Connected: WebSocket Open
    Connected --> Syncing: Yjs Sync
    Syncing --> Ready: Sync Complete
    Ready --> Editing: User Input
    Editing --> Syncing: Update Broadcast
    Connected --> Disconnected: Connection Lost
    Disconnected --> Connecting: Retry
```

## Server Side

### Express Server
- REST API endpoints for document management
- WebSocket server for real-time collaboration
- SQLite database operations
- Redis cache operations

### Yjs Synchronization
- Receives updates from clients
- Broadcasts to all connected clients
- Persists to SQLite on changes
- Updates Redis cache

## Data Storage

### SQLite Database Schema

```mermaid
erDiagram
    DOCUMENTS {
        TEXT id PK
        TEXT title
        BLOB content
        DATETIME created_at
        DATETIME updated_at
    }
```

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content BLOB,  -- Yjs binary updates
  created_at DATETIME,
  updated_at DATETIME
);
```

### Redis Cache Keys

```mermaid
graph LR
    A[Redis Cache] --> B[documents:list<br/>TTL: 5min]
    A --> C[document:meta:docId<br/>TTL: 5min]
    A --> D[document:updates<br/>Pub/Sub Channel]
```

- `documents:list`: Cached document list (TTL: 5 min)
- `document:meta:<docId>`: Document metadata (TTL: 5 min)
- Pub/Sub channel: `document:updates`

## Real-time Synchronization Flow

### 1. Client Connects

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket
    participant S as Server
    participant DB as SQLite
    
    C->>WS: Connect
    WS->>S: Connection Request
    S->>DB: Load Document
    DB-->>S: Document Data
    S->>WS: Send Initial Sync
    WS-->>C: Yjs Update
    C->>C: Apply to Editor
```

### 2. User Types

```mermaid
sequenceDiagram
    participant U as User
    participant T as Tiptap
    participant Y as Yjs
    participant WS as WebSocket
    participant S as Server
    participant DB as SQLite
    participant R as Redis
    participant O as Other Clients
    
    U->>T: Type Text
    T->>Y: Update CRDT
    Y->>WS: Send Update
    WS->>S: Sync Message
    S->>DB: Save Update
    S->>R: Invalidate Cache
    S->>O: Broadcast Update
    O->>O: Update Editor
```

### 3. Other Clients Receive

```mermaid
sequenceDiagram
    participant S as Server
    participant WS as WebSocket
    participant Y as Yjs Document
    participant T as Tiptap
    participant U as User
    
    S->>WS: Broadcast Update
    WS->>Y: Receive Update
    Y->>T: Apply Change
    T->>U: Show in UI
```

## CRDT (Conflict-free Replicated Data Types)

```mermaid
graph TB
    A[User A Types 'Hello'] --> D[Yjs CRDT]
    B[User B Types 'World'] --> D
    C[User C Types '!'] --> D
    D --> E[Automatic Merge]
    E --> F['Hello World!']
    F --> G[All Users See Same Result]
```

Yjs uses CRDTs to ensure:
- No conflicts when multiple users edit simultaneously
- Automatic merge of concurrent changes
- Eventual consistency across all clients
- Works even with network delays

## Performance Optimizations

### Redis Caching Strategy

```mermaid
graph LR
    A[API Request] --> B{Cache Hit?}
    B -->|Yes| C[Return Cached]
    B -->|No| D[Query SQLite]
    D --> E[Store in Cache]
    E --> F[Return Result]
```

- Document list: Cached for 5 minutes
- Metadata: Cached per document
- Reduces SQLite queries

### WebSocket Efficiency
- Binary protocol (efficient)
- Incremental updates only
- Automatic compression

### Client-side
- useMemo for extensions
- Conditional rendering
- Efficient React updates

## Security Considerations

```mermaid
graph TB
    A[Security Measures] --> B[SQL Injection<br/>Parameterized Queries]
    A --> C[XSS<br/>React + Tiptap]
    A --> D[CORS<br/>Configured]
    A --> E[No Auth<br/>TODO: Add]
```

- No authentication (add if needed)
- No authorization (add if needed)
- SQL injection: Prevented by parameterized queries
- XSS: Handled by React and Tiptap
- CORS: Configured for development

## Scalability

### Current Limitations

```mermaid
graph TB
    A[Current Setup] --> B[Single Server]
    A --> C[In-Memory Docs]
    A --> D[No Load Balancing]
```

- Single server instance
- In-memory document storage (server restart = lost)
- No horizontal scaling

### Future Improvements

```mermaid
graph TB
    A[Improved Setup] --> B[Multiple Servers]
    A --> C[Redis Doc Storage]
    A --> D[Load Balancer]
    A --> E[Auth System]
    A --> F[Rate Limiting]
```

- Redis for document storage (shared across instances)
- Load balancer for multiple servers
- Authentication/authorization
- Rate limiting

## Error Handling

### Client Error Flow

```mermaid
graph TB
    A[Error Occurs] --> B{Error Type?}
    B -->|Connection| C[Retry Connection]
    B -->|Sync| D[Log & Continue]
    B -->|Fatal| E[Show Error UI]
    C --> F[Reconnect]
    F --> G[Resume Sync]
```

### Server Error Flow

```mermaid
graph TB
    A[Error Occurs] --> B{Error Type?}
    B -->|DB| C[Log & Return 500]
    B -->|Redis| D[Fallback to DB]
    B -->|WebSocket| E[Log & Disconnect]
    C --> F[Client Handles]
    D --> F
    E --> F
```

## Deployment Architecture

```mermaid
graph TB
    A[Load Balancer] --> B[Server 1]
    A --> C[Server 2]
    A --> D[Server 3]
    B --> E[(Shared Redis)]
    C --> E
    D --> E
    B --> F[(Shared SQLite<br/>or PostgreSQL)]
    C --> F
    D --> F
```
