'use client';

import { useState, useEffect } from 'react';
import AuthContainer from '../components/AuthContainer';
import ChatApp from '../components/ChatApp';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already authenticated
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  const handleAuthSuccess = (newToken: string) => {
    setToken(newToken);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setToken(null);
    setIsAuthenticated(false);
  };

  if (isAuthenticated && token) {
    return <ChatApp token={token} onLogout={handleLogout} />;
  }

  return <AuthContainer onAuthSuccess={handleAuthSuccess} />;
}
