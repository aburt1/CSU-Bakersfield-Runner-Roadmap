import React from 'react';
import { useAuth } from './auth/AuthProvider.jsx';
import RoadmapPage from './pages/RoadmapPage.jsx';
import PublicRoadmapPreview from './components/PublicRoadmapPreview.jsx';

export default function App(): React.ReactElement {
  const { loading: authLoading, devLogin, isAuthenticated } = useAuth();

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" role="status" aria-label="Loading">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
          <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Unauthenticated: show public preview with embedded login
  if (!isAuthenticated) {
    return <PublicRoadmapPreview onLogin={devLogin} />;
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <RoadmapPage />
    </>
  );
}
