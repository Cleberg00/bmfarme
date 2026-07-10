import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './components/LoginPage';
import GodModePanel from './components/GodModePanel';

function AppContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <GodModePanel /> : <LoginPage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}