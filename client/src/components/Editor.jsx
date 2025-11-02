import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import './Editor.css';

function Editor({ docId }) {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!docId) return;

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Create WebSocket provider
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:1234';
    const provider = new WebsocketProvider(
      wsUrl,
      `?doc=${docId}`,
      ydoc
    );

    providerRef.current = provider;

    // Monitor connection status
    const handleStatus = (event) => {
      setConnectionStatus(event.status);
      if (event.status === 'connected' && provider.awareness) {
        setIsReady(true);
      }
    };

    provider.on('status', handleStatus);

    // Check if provider is already ready
    const checkReady = () => {
      if (provider && provider.awareness) {
        setIsReady(true);
        setConnectionStatus('connected');
      } else {
        // Wait a bit and check again
        setTimeout(checkReady, 50);
      }
    };
    
    checkReady();

    return () => {
      provider.off('status', handleStatus);
      provider.destroy();
      ydoc.destroy();
    };
  }, [docId]);

  // Build extensions array conditionally with useMemo
  const extensions = useMemo(() => {
    const baseExtensions = [
      StarterKit.configure({
        history: false, // Yjs handles history
      }),
      Placeholder.configure({
        placeholder: 'Start typing... Use / for commands',
      }),
      Collaboration.configure({
        document: ydocRef.current || new Y.Doc(),
      }),
    ];

    // Only add CollaborationCursor when provider and awareness are ready
    if (isReady && providerRef.current && providerRef.current.awareness) {
      baseExtensions.push(
        CollaborationCursor.configure({
          provider: providerRef.current,
          user: {
            name: `User ${Math.random().toString(36).substr(2, 9)}`,
            color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
          },
        })
      );
    }

    return baseExtensions;
  }, [isReady, docId]);

  const editor = useEditor({
    extensions,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
    editable: isReady && ydocRef.current && providerRef.current,
  }, [isReady, docId, extensions]);

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="doc-info">
          <h2>Document: {docId}</h2>
          <span className={`status ${connectionStatus}`}>
            {connectionStatus === 'connected' ? '?? Connected' : '?? Connecting...'}
          </span>
        </div>
      </div>
      <div className="editor-wrapper">
        <div className="editor-content">
          {editor && <EditorContent editor={editor} />}
          {!isReady && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              Connecting to server...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Editor;
