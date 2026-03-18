import { useAuth } from './auth/AuthProvider';
import RoadmapPage from './pages/RoadmapPage';
import PublicRoadmapPreview from './components/PublicRoadmapPreview';

export default function App() {
  const { loading: authLoading, devLogin, isAuthenticated } = useAuth();

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
