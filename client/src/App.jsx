import { useState } from 'react';
import { useAuth } from './auth/AuthProvider';
import RoadmapPage from './pages/RoadmapPage';

export default function App() {
  const { loading: authLoading, devLogin, isAuthenticated } = useAuth();
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Auth gate
  if (!isAuthenticated) {
    const handleLogin = async (e) => {
      e.preventDefault();
      setLoginError('');
      try {
        await devLogin(loginName, loginEmail);
      } catch {
        setLoginError('Login failed. Make sure the server is running.');
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
            Road to Becoming a{' '}
            <span className="text-csub-gold">Roadrunner</span>
          </h1>
          <p className="font-body text-csub-gray mb-6 text-base">
            Sign in to track your admissions progress.
          </p>
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block font-body text-sm font-semibold text-csub-blue-dark mb-1">Name</label>
              <input
                type="text"
                required
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-body text-sm font-semibold text-csub-blue-dark mb-1">Email</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="jdoe@csub.edu"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
              />
            </div>
            {loginError && (
              <p className="text-red-600 text-sm font-body">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold text-lg uppercase tracking-wider px-8 py-4 rounded-lg shadow-lg transition-colors duration-200"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <RoadmapPage />;
}
