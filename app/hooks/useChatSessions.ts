import { useState, useEffect, useCallback } from 'react';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load all sessions
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new session
  const createSession = useCallback(async (title: string = 'New Chat') => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        const data = await response.json();
        const newSession = data.session;
        return newSession.id;
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    return null;
  }, []);

  // Update session title
  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        setSessions(prev => prev.map(session => 
          session.id === sessionId ? { ...session, title } : session
        ));
      }
    } catch (error) {
      console.error('Failed to update session title:', error);
    }
  }, []);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setSessions(prev => prev.filter(session => session.id !== sessionId));
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, []);



  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    isLoading,
    createSession,
    updateSessionTitle,
    deleteSession,
    loadSessions,
  };
}
