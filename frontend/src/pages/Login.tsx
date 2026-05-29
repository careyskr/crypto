import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MarketOverview from '../components/MarketOverview';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {/* Left: Login Form */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-green to-accent-blue mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text-primary">Welcome Back</h1>
            <p className="text-text-muted text-sm mt-1">Sign in to your trading dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="glass p-6 space-y-5">
            {error && (
              <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-4 py-3 text-sm text-accent-red">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-bg-primary border border-border-primary rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full bg-bg-primary border border-border-primary rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-green/50 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-accent-green text-bg-primary font-semibold text-sm hover:bg-accent-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-bg-primary/30 border-t-bg-primary rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Login'
              )}
            </button>

            <div className="flex items-center justify-between text-xs">
              <div className="text-text-muted">
                Don't have an account?{' '}
                <Link to="/signup" className="text-accent-green hover:text-accent-green/80 transition-colors font-medium">
                  Create account
                </Link>
              </div>
              <div className="text-text-muted">
                Forgot password?
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Right: Market Data */}
      <div className="hidden lg:flex flex-1 border-l border-border-primary bg-bg-secondary/30">
        <MarketOverview />
      </div>
    </div>
  );
}
