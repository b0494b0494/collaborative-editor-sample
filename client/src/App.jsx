import React, { useState, useEffect } from 'react';
import Editor from './components/Editor';
import DocumentList from './components/DocumentList';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [currentDocId, setCurrentDocId] = useState(null);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents`);
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  const createDocument = async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `Document ${Date.now()}`,
        }),
      });
      const doc = await response.json();
      setCurrentDocId(doc.id);
      fetchDocuments();
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  const deleteDocument = async (id) => {
    try {
      await fetch(`${API_URL}/api/documents/${id}`, {
        method: 'DELETE',
      });
      if (currentDocId === id) {
        setCurrentDocId(null);
      }
      fetchDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>?? Collaborative Editor</h1>
          <button className="btn-primary" onClick={createDocument}>
            + New Document
          </button>
        </div>
        <DocumentList
          documents={documents}
          currentDocId={currentDocId}
          onSelectDoc={setCurrentDocId}
          onDeleteDoc={deleteDocument}
        />
      </div>
      <div className="main-content">
        {currentDocId ? (
          <Editor docId={currentDocId} />
        ) : (
          <div className="empty-state">
            <h2>Select a document or create a new one to start editing</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
