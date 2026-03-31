import { useEffect, useState } from 'react';
import {
  deleteLogFile,
  downloadLogFile,
  fetchLogFilePreview,
  fetchLogFiles,
  type LogFileInfo,
} from '../api/system';
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
  const [previewMeta, setPreviewMeta] = useState<{ truncated: boolean; size: number } | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [actingName, setActingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = () => {
    setLoadingFiles(true);
    setError(null);
    fetchLogFiles()
      .then((res) => {
        setFiles(res.files);
        setSelectedName((current) => {
          if (current && res.files.some((file) => file.name === current)) return current;
          return res.files[0]?.name ?? null;
        });
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load log files')))
      .finally(() => setLoadingFiles(false));
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handlePreview = async (name: string) => {
    setSelectedName(name);
    setLoadingPreview(true);
    setError(null);
    try {
      const preview = await fetchLogFilePreview(name);
      setContent(preview.content);
      setPreviewMeta({ truncated: preview.truncated, size: preview.size });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load log preview'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async (name: string) => {
    setActingName(name);
    setError(null);
    try {
      await downloadLogFile(name);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download log file'));
    } finally {
      setActingName(null);
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete log file "${name}"?`)) return;
    setActingName(name);
    setError(null);
    try {
      await deleteLogFile(name);
      setFiles((prev) => prev.filter((file) => file.name !== name));
      if (selectedName === name) {
        setSelectedName(null);
        setContent('');
        setPreviewMeta(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete log file'));
    } finally {
      setActingName(null);
    }
  };

  return (
    <div className="page">
      <h2 className="page-heading">Logs</h2>
      <p className="page-subheading">
        Daily protocol and app log files. Preview is loaded only when requested so large files do not slow the page down.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={loadFiles} disabled={loadingFiles}>
          {loadingFiles ? 'Refreshing...' : 'Refresh files'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: '1rem' }}>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const isSelected = selectedName === file.name;
                    const isActing = actingName === file.name;
                    return (
                      <tr
                        key={file.name}
                        style={{
                          backgroundColor: isSelected ? 'var(--bg, #f7f7f7)' : undefined,
                        }}
                      >
                        <td>
                          <div>{file.name}</div>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>{new Date(file.modifiedAt).toLocaleString()}</div>
                        </td>
                        <td>{formatSize(file.size)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button type="button" className="btn-link" onClick={() => void handlePreview(file.name)} disabled={loadingPreview && isSelected}>
                              {loadingPreview && isSelected ? 'Loading...' : 'Preview'}
                            </button>
                            <button type="button" className="btn-link" onClick={() => void handleDownload(file.name)} disabled={isActing}>
                              {isActing ? 'Working...' : 'Download'}
                            </button>
                            <button type="button" className="btn-link danger" onClick={() => void handleDelete(file.name)} disabled={isActing}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div style={{ marginBottom: '0.75rem', fontWeight: 600 }}>
            {selectedName ?? 'Select a log file'}
          </div>
          {previewMeta && (
            <p className="card-meta" style={{ marginTop: 0 }}>
              {previewMeta.truncated
                ? `Showing the latest preview from ${formatSize(previewMeta.size)}. Use Download for the full file.`
                : `Showing full preview (${formatSize(previewMeta.size)}).`}
            </p>
          )}
          {loadingPreview ? (
            <p className="muted">Loading log preview...</p>
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
              {content || 'No preview loaded. Click Preview on a log file.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
