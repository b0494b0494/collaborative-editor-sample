import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import './Editor.css';

function Editor({ docId }) {
  const textareaRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const ytextRef = useRef(null);
  const isLocalUpdateRef = useRef(false);

  useEffect(() => {
    if (!textareaRef.current) return;

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
    provider.on('status', (event) => {
      setConnectionStatus(event.status);
    });

    // Create Yjs text type
    const ytext = ydoc.getText('content');
    ytextRef.current = ytext;

    // Set initial text
    const initialText = ytext.toString();
    if (textareaRef.current) {
      textareaRef.current.value = initialText;
    }

    // Reflect changes from Yjs to textarea
    const updateHandler = () => {
      if (textareaRef.current && !isLocalUpdateRef.current) {
        const text = ytext.toString();
        const cursorPos = textareaRef.current.selectionStart;
        textareaRef.current.value = text;
        // Restore cursor position if possible
        const newPos = Math.min(cursorPos, text.length);
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    };

    ytext.observe(updateHandler);

    // Reflect changes from textarea to Yjs
    const handleInput = (e) => {
      const newValue = e.target.value;
      const currentValue = ytext.toString();
      
      if (newValue !== currentValue) {
        isLocalUpdateRef.current = true;
        
        // Simple diff calculation
        const cursorPos = e.target.selectionStart;
        let start = 0;
        
        // Skip common prefix
        while (start < currentValue.length && 
               start < newValue.length && 
               currentValue[start] === newValue[start]) {
          start++;
        }
        
        // Skip common suffix
        let end1 = currentValue.length;
        let end2 = newValue.length;
        while (end1 > start && end2 > start && 
               currentValue[end1 - 1] === newValue[end2 - 1]) {
          end1--;
          end2--;
        }
        
        // Apply delete and insert
        if (end1 > start) {
          ytext.delete(start, end1 - start);
        }
        if (end2 > start) {
          const insertText = newValue.substring(start, end2);
          ytext.insert(start, insertText);
        }
        
        // Restore cursor position
        setTimeout(() => {
          if (textareaRef.current) {
            const newPos = Math.min(cursorPos, newValue.length);
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
          isLocalUpdateRef.current = false;
        }, 0);
      }
    };

    const textarea = textareaRef.current;
    textarea.addEventListener('input', handleInput);

    return () => {
      ytext.unobserve(updateHandler);
      if (textarea) {
        textarea.removeEventListener('input', handleInput);
      }
      provider.destroy();
      ydoc.destroy();
    };
  }, [docId]);

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
        <textarea
          ref={textareaRef}
          className="editor-content"
          placeholder="Type your text here. Open multiple browser tabs to see real-time collaboration."
        />
      </div>
    </div>
  );
}

export default Editor;
