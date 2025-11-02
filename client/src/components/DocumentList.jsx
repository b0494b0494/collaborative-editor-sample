import React from 'react';
import './DocumentList.css';

function DocumentList({ documents, currentDocId, onSelectDoc, onDeleteDoc }) {
  return (
    <div className="document-list">
      {documents.length === 0 ? (
        <div className="empty-list">No documents</div>
      ) : (
        documents.map((doc) => (
          <div
            key={doc.id}
            className={`document-item ${currentDocId === doc.id ? 'active' : ''}`}
            onClick={() => onSelectDoc(doc.id)}
          >
            <div className="document-info">
              <div className="document-title">{doc.title || `Document ${doc.id}`}</div>
              <div className="document-meta">
                {new Date(doc.updated_at).toLocaleDateString('en-US')}
              </div>
            </div>
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Are you sure you want to delete this document?')) {
                  onDeleteDoc(doc.id);
                }
              }}
            >
              ?
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export default DocumentList;
