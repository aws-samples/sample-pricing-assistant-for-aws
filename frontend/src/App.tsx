import { useState } from 'react';
import { ChatProvider } from './hooks/useChat';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { ModelProvider } from './hooks/useModel';
import { AuthProvider, useAuth } from './hooks/useAuth';
import ChatInterface from './components/ChatInterface';
import Header from './components/Header';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import AuthScreen from './components/AuthScreen';
import AdminPanel from './components/AdminPanel';

function AppContent() {
  const { theme } = useTheme();
  const auth = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);

  // While we don't yet know whether auth is configured, render an empty
  // shell — avoids flicker between AuthScreen and chat on first paint.
  if (auth.configLoading) {
    return <div className={`min-h-screen ${theme === 'dark' ? 'bg-dark-bg' : 'bg-light-bg'}`} />;
  }

  // Auth is enabled and the user isn't signed in: route to AuthScreen.
  if (auth.config?.enabled && !auth.user) {
    return <AuthScreen />;
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      theme === 'dark'
        ? 'bg-dark-bg text-dark-text-primary'
        : 'bg-light-bg text-light-text-primary'
    }`}>
      <Header onOpenAdmin={auth.user?.isAdmin ? () => setAdminOpen(true) : undefined} />

      <main className="flex-1 flex flex-col">
        <ChatInterface />
      </main>

      <Footer />

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ModelProvider>
            <ChatProvider>
              <AppContent />
            </ChatProvider>
          </ModelProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
