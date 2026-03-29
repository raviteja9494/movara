import { useEffect, useState } from 'react';
import { fetchLogFileContent, fetchLogFiles, type LogFileInfo } from '../api/system';
import { getErrorMessage } from '../utils/getErrorMessage';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Logs() {
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = () => {
    setLoadingFiles(true);
    setError(null);
    fetchLogFiles()
      .then((res) => {
        setFiles(res.files);
        if (!selectedName && res.files.length > 0) {
          setSelectedName(res.files[0].name);
        }
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load log files')))
      .finally(() => setLoadingFiles(false));
  };

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    if (!selectedName) {
      setContent('');
      return;
    }
    setLoadingContent(true);
    setError(null);
    fetchLogFileContent(selectedName)
      .then((text) => setContent(text))
      .catch((err) => setError(getErrorMessage(err, 'Failed to load log file')))
      .finally(() => setLoadingContent(false));
  }, [selectedName]);

  return (
    <div className="page">
      <h2 className="page-heading">Logs</h2>
      <p className="page-subheading">
        Daily protocol and app log files. Protocol logging is enabled by default, old files are pruned automatically, and the latest files are shown here as plain text.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={loadFiles} disabled={loadingFiles}>
          {loadingFiles ? 'Refreshing...' : 'Refresh files'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: '1rem' }}>
        <div>
          {loadingFiles ? (
            <p className="muted">Loading log files...</p>
          ) : files.length === 0 ? (
            <p className="muted">No log files found yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr
                      key={file.name}
                      onClick={() => setSelectedName(file.name)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedName === file.name ? 'var(--bg, #f7f7f7)' : undefined,
                      }}
                    >
                      <td>
                        <div>{file.name}</div>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>{new Date(file.modifiedAt).toLocaleString()}</div>
                      </td>
                      <td>{formatSize(file.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: '0.75rem', fontWeight: 600 }}>
            {selectedName ?? 'Select a log file'}
          </div>
          {loadingContent ? (
            <p className="muted">Loading log content...</p>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: '1rem',
                minHeight: '28rem',
                maxHeight: '70vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--bg, #f7f7f7)',
                borderRadius: '0.75rem',
                fontSize: '0.82rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              {content || 'No content.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
