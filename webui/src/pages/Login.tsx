import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, setToken, setCurrentUser, isLoggedIn } from '../api/auth';
import { getErrorMessage } from '../utils/getErrorMessage';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isLoggedIn()) {
    navigate('/', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const fn = mode === 'login' ? login : register;
      const res = await fn(email, password);
      setToken(res.token);
      setCurrentUser(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      const fallback = mode === 'login' ? 'Invalid email or password.' : 'Request failed.';
      setError(getErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: '360px', margin: '4rem auto', padding: '2rem' }}>
      <section className="page-section">
        <h2 className="page-heading">Movara</h2>
        <p className="page-subheading" style={{ marginBottom: '1.5rem' }}>
          {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
                autoComplete="email"
                style={{ display: 'block', marginTop: '0.25rem', width: '100%' }}
              />
            </label>
          </div>
          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <label>
              Password
              <div style={{ position: 'relative', display: 'block', marginTop: '0.25rem' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  style={{ width: '100%', paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '0.25rem',
                    fontSize: '0.8rem',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            {mode === 'register' && (
              <p className="card-meta" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                At least 8 characters
              </p>
            )}
          </div>
          {error && (
            <p className="form-error" style={{ marginBottom: '1rem' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button type="button" className="btn-link" onClick={() => { setMode('register'); setError(null); }}>
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="btn-link" onClick={() => { setMode('login'); setError(null); }}>
                Sign in
              </button>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
