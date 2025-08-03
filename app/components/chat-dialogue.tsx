import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessageComponent } from "./ChatMessage";
import { useChatMessages } from "~/hooks/useChatMessages";
import { useChatSessions } from "~/hooks/useChatSessions";

export function ChatDialogue({models}: { models: any[] }) {
  const [model, setModel] = useState("gpt-4o-mini");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get current session ID from URL
  const currentSessionId = searchParams.get('session') || undefined;

  const {
    sessions,
    isLoading: sessionsLoading,
    createSession,
    updateSessionTitle,
    deleteSession,
    loadSessions,
  } = useChatSessions();

  const {
    messages,
    input,
    setInput,
    isLoading,
    toolStatus,
    messagesEndRef,
    sendMessage,
    loadSession,
    toggleToolCollapse,
    clearMessages,
  } = useChatMessages({
    sessionId: currentSessionId,
    model,
    onSessionCreated: (sessionId: string) => {
      navigate(`?session=${sessionId}`);
      loadSessions(); // Refresh sessions list
    },
    onSessionUpdated: () => {
      loadSessions();
    },
  });

  // Load session when URL changes
  useEffect(() => {
    if (currentSessionId) {
      loadSession(currentSessionId);
    } else {
      clearMessages();
    }
  }, [currentSessionId, loadSession, clearMessages]);

  // Handle session selection
  const handleSessionSelect = async (sessionId: string) => {
    navigate(`?session=${sessionId}`);
    setSidebarOpen(false);
  };

  // Handle new session creation
  const handleNewSession = async () => {
    const newSessionId = await createSession();
    if (newSessionId) {
      navigate(`?session=${newSessionId}`);
      loadSessions(); // Refresh sessions list
    }
    setSidebarOpen(false);
  };

  // Handle session deletion
  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    // If we deleted the current session, clear the URL
    if (currentSessionId === sessionId) {
      navigate('/');
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar
        sessions={sessions}
        currentSessionId={currentSessionId || null}
        isLoading={sessionsLoading}
        onSelectSession={handleSessionSelect}
        onCreateSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onUpdateSessionTitle={updateSessionTitle}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Chat Bot</h1>
          </div>

          {/* Model selector */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isLoading}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {models.map((m: any) => (
              <option key={m.id} value={m.id} title={m.description}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p>Start a conversation</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <ChatMessageComponent
                  key={index}
                  message={message}
                  index={index}
                  onToggleCollapse={toggleToolCollapse}
                />
              ))}

              {/* Tool status indicator */}
              {toolStatus && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2 text-blue-800">
                      <div className="animate-spin">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <span className="text-sm">
                        {toolStatus.completed ? 'Completed' : 'Calling'} tool: {toolStatus.name}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <div className="bg-white border-t border-gray-200 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                'Send'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};