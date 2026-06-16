import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import GodModePanel from './components/GodModePanel';

function AppContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <GodModePanel /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}