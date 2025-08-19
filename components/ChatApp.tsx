"use client";

import { useEffect, useRef, useState } from "react";

interface User {
  id: number;
  username: string;
  email: string;
}

interface ChatMessage {
  user: { id: number; username: string; email: string };
  content: string;
  created_at: string;
}

interface ChatAppProps {
  token: string;
  onLogout: () => void;
}

type ServerEvent =
  | { type: "boot"; data: { messages: ChatMessage[]; online_users: User[] } }
  | { type: "message"; data: ChatMessage }
  | { type: "online_users"; data: User[] };

export default function ChatApp({ token, onLogout }: ChatAppProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchUserProfile();
  }, [token]);

  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`ws://localhost:8000/ws/chat?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      try {
        const parsed: ServerEvent = JSON.parse(event.data);
        if (parsed.type === "boot") {
          setMessages(parsed.data.messages || []);
          setOnlineUsers(parsed.data.online_users || []);
        } else if (parsed.type === "message") {
          setMessages((prev) => [...prev, parsed.data]);
        } else if (parsed.type === "online_users") {
          setOnlineUsers(parsed.data || []);
        }
      } catch (_) {
        // Support plain text broadcast fallback
        const asText = String(event.data || "");
        if (asText.trim().length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              user: { id: 0, username: "System", email: "system" },
              content: asText,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    };

    return () => {
      try { ws.close(); } catch {}
    };
  }, [user, token]);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch("http://localhost:8000/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        onLogout();
      }
    } catch (error) {
      onLogout();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    try { wsRef.current?.close(); } catch {}
    onLogout();
  };

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  const isOwn = (m: ChatMessage) => m.user.email === user?.email;

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Top Bar */}
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h6m-9 8l2-5 2 5 2-5 2 5 2-5 2 5" />
              </svg>
            </div>
            <div className="">
              <div className="text-gray-900 dark:text-gray-100 font-semibold">Chat</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{isConnected ? "Online" : "Offline"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <span className="font-medium">{user?.username}</span>
            </div>
            <button onClick={handleLogout} className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700">Logout</button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-0 md:gap-6 h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <aside className="hidden md:flex md:col-span-4 lg:col-span-3 border-r border-gray-200 dark:border-gray-800 flex-col bg-white dark:bg-gray-900">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messages</div>
            <div className="mt-3 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" /></svg>
              </span>
              <input
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                placeholder="Search"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="p-2 overflow-y-auto">
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 px-2 py-2">Online</div>
            <div className="space-y-1">
              {onlineUsers
                .filter((u) =>
                  `${u.username} ${u.email}`.toLowerCase().includes(activeFilter.toLowerCase())
                )
                .map((u) => (
                  <div key={u.email} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <div className="relative">
                      <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200">
                        {u.username?.[0]?.toUpperCase()}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900"></span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{u.username}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                    </div>
                    <div className="ml-auto text-[10px] text-gray-400">online</div>
                  </div>
                ))}
              {onlineUsers.length === 0 && (
                <div className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">No users online</div>
              )}
            </div>
          </div>
        </aside>

        {/* Chat area */}
        <section className="md:col-span-8 lg:col-span-9 flex flex-col">
          {/* Thread header */}
          <div className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center">G</div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">General Chat</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{onlineUsers.length} online</div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Search in chat">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" /></svg>
              </button>
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="More">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6h.01M12 12h.01M12 18h.01" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 bg-gray-50/60 dark:bg-gray-900">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${isOwn(m) ? "justify-end" : "justify-start"}`}>
                {!isOwn(m) && (
                  <div className="mr-2 mt-4 h-8 w-8 flex-shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200">
                    {m.user.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className={`max-w-[78%] sm:max-w-[65%] ${isOwn(m) ? "items-end" : "items-start"}`}>
                  <div className={`text-xs mb-1 px-1 text-gray-500 dark:text-gray-400 ${isOwn(m) ? "text-right" : "text-left"}`}>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{m.user.username}</span>
                    <span className="mx-1">•</span>
                    <span>{formatTime(m.created_at)}</span>
                  </div>
                  <div className={`${isOwn(m) ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"} rounded-2xl px-4 py-2 shadow-sm border ${isOwn(m) ? "border-blue-600" : "border-gray-200 dark:border-gray-700"}`}>
                    {m.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Attach file">
                <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15V8a5 5 0 10-10 0v9a3 3 0 106 0V9" /></svg>
              </button>
              <div className="flex-1 relative">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isConnected ? "Write a message..." : "Connecting..."}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Emoji">
                  <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM15.5 11v0M8.5 11v0M8 15s1.5 2 4 2 4-2 4-2" /></svg>
                </button>
              </div>
              <button
                onClick={sendMessage}
                disabled={!isConnected || input.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12l14-7-6 14-2-5-5-2z" />
                </svg>
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
