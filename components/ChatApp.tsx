"use client";

import { useEffect, useRef, useState } from "react";

interface User {
  id: number;
  username: string;
  email: string;
}

interface Reaction {
  emoji: string;
  users: string[];
}

interface ChatMessage {
  id?: string;
  user: { id: number; username: string; email: string };
  content: string;
  created_at: string;
  messageType?: 'text' | 'image' | 'video' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyTo?: ChatMessage;
  recipientId?: number;
  recipientUsername?: string;
  recipientEmail?: string;
  reactions?: Reaction[];
}

interface ChatAppProps {
  token: string;
  onLogout: () => void;
}

type ServerEvent =
  | { type: "boot"; data: { messages: ChatMessage[]; online_users: User[] } }
  | { type: "message"; data: ChatMessage }
  | { type: "online_users"; data: User[] }
  | { type: "reaction"; data: { messageId: string; reaction: Reaction } }
  | { type: "delete"; data: { messageId: string } }
  | { type: "error"; data: string };

export default function ChatApp({ token, onLogout }: ChatAppProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDirectMessage, setIsDirectMessage] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const userListRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  // Common emojis for reactions
  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🙏', '🔥', '💯'];

  useEffect(() => {
    fetchUserProfile();
    fetchAllUsers();
  }, [token]);

  useEffect(() => {
    if (!user) return;
    
    console.log("Connecting WebSocket for user:", user.username);
    const ws = new WebSocket(`ws://localhost:8000/ws/chat?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected for user:", user.username);
      setIsConnected(true);
    };
    ws.onclose = (event) => {
      console.log("WebSocket disconnected for user:", user.username, "Code:", event.code, "Reason:", event.reason);
      setIsConnected(false);
    };
    ws.onerror = (error) => {
      console.error("WebSocket error for user:", user.username, error);
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as ServerEvent;
        console.log("WebSocket message received:", parsed);
        console.log("Raw message data:", event.data);
        
                 if (parsed.type === "boot") {
           console.log("Boot data:", parsed.data);
           // Filter messages based on current conversation
           const allMessages = parsed.data.messages || [];
           if (isDirectMessage && selectedUser) {
             // For direct messages, only show messages between current user and selected user
             const directMessages = allMessages.filter((msg: ChatMessage) => 
               (msg.user.id === user?.id && msg.recipientId === selectedUser?.id) ||
               (msg.user.id === selectedUser?.id && msg.recipientId === user?.id)
             );
             setMessages(directMessages);
           } else {
             // For general chat, only show messages without recipient (general messages)
             const generalMessages = allMessages.filter((msg: ChatMessage) => !msg.recipientId);
             setMessages(generalMessages);
           }
           setOnlineUsers(parsed.data.online_users || []);
                 } else if (parsed.type === "message") {
           console.log("New message:", parsed.data);
           // Only add message if it's for the current conversation
           const message = parsed.data;
           if (isDirectMessage) {
             // For direct messages, only show messages between current user and selected user
             if ((message.user.id === user?.id && message.recipientId === selectedUser?.id) ||
                 (message.user.id === selectedUser?.id && message.recipientId === user?.id)) {
               setMessages((prev) => [...prev, message]);
             }
           } else {
             // For general chat, only show messages without recipient (general messages)
             if (!message.recipientId) {
               setMessages((prev) => [...prev, message]);
             }
           }
        } else if (parsed.type === "online_users") {
          console.log("Online users update:", parsed.data);
          console.log("Current online users count:", parsed.data?.length || 0);
          setOnlineUsers(parsed.data || []);
        } else if (parsed.type === "reaction") {
          setMessages((prev) => 
            prev.map(msg => 
              msg.id === parsed.data.messageId 
                ? { ...msg, reactions: [...(msg.reactions || []), parsed.data.reaction] }
                : msg
            )
          );
        } else if (parsed.type === "delete") {
          setMessages((prev) => prev.filter(msg => msg.id !== parsed.data.messageId));
        } else if (parsed.type === "error") {
          console.error("Server error:", parsed.data);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error, event.data);
        // Support plain text broadcast fallback
        const asText = String(event.data || "");
        if (asText.trim().length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              user: { id: 0, username: "System", email: "system" },
              content: asText,
              created_at: new Date().toISOString(),
              messageType: 'text'
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
    // Improved auto-scroll to bottom on new messages
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ 
          behavior: "smooth",
          block: "end"
        });
      }
    };

    // Use setTimeout to ensure DOM is updated
    const timeoutId = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const fetchAllUsers = async () => {
    try {
      const response = await fetch("http://localhost:8000/auth/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const usersData = await response.json();
        setAllUsers(usersData);
      }
    } catch (error) {
      console.error("Error fetching all users:", error);
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
    
    // Always use JSON for direct messages or messages with replies
    if (isDirectMessage || replyTo) {
      const messageData = {
        content: trimmed,
        replyTo: replyTo?.id ? String(replyTo.id) : null,
        recipientId: selectedUser?.id || null,
        messageType: 'text'
      };
      wsRef.current.send(JSON.stringify(messageData));
    } else {
      // Send simple text messages as plain text for general chat
      wsRef.current.send(trimmed);
    }
    
    setInput("");
    setReplyTo(null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      if (response.ok) {
        const { fileUrl, fileName, fileSize } = await response.json();
        
        // Always use JSON for file uploads since they need metadata
        const messageData = {
          content: '',
          fileUrl,
          fileName,
          fileSize,
          messageType: file.type.startsWith('image/') ? 'image' : 
                      file.type.startsWith('video/') ? 'video' : 'file',
          replyTo: replyTo?.id ? String(replyTo.id) : null
        };
        
        wsRef.current.send(JSON.stringify(messageData));
        setReplyTo(null);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const addReaction = (messageId: string, emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    // Send reaction via HTTP API instead of WebSocket for better reliability
    fetch(`http://localhost:8000/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ emoji })
    }).catch(error => console.error('Failed to add reaction:', error));
    
    setShowReactions(null);
  };

  const deleteMessage = (messageId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    // Send delete via HTTP API instead of WebSocket for better reliability
    fetch(`http://localhost:8000/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    }).catch(error => console.error('Failed to delete message:', error));
  };

  const addEmoji = (emoji: string) => {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const sendEmojiDirectly = (emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    // Send emoji as plain text for general chat, JSON for direct messages
    if (isDirectMessage) {
      const messageData = {
        content: emoji,
        recipientId: selectedUser?.id || null,
        messageType: 'text'
      };
      wsRef.current.send(JSON.stringify(messageData));
    } else {
      wsRef.current.send(emoji);
    }
    setShowEmojiPicker(false);
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setIsDirectMessage(true);
    setMessages([]); // Clear messages when switching to direct message
  };

  const handleGeneralChat = () => {
    setSelectedUser(null);
    setIsDirectMessage(false);
    setMessages([]); // Clear messages when switching to general chat
  };

  // Reload messages when switching conversations
  useEffect(() => {
    if (isConnected && user) {
      // Clear messages and let the WebSocket boot data handle loading the correct messages
      setMessages([]);
    }
  }, [isDirectMessage, selectedUser?.id, isConnected, user]);



  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isOwn = (m: ChatMessage) => m.user.email === user?.email;

  const isUserOnline = (userEmail: string) => {
    return onlineUsers.some(onlineUser => onlineUser.email === userEmail);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const toggleMessageExpansion = (messageIndex: number) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageIndex)) {
        newSet.delete(messageIndex);
      } else {
        newSet.add(messageIndex);
      }
      return newSet;
    });
  };

  const renderMessageContent = (message: ChatMessage, messageIndex: number) => {
    const isExpanded = expandedMessages.has(messageIndex);
    const isLongMessage = message.content.length > 150;
    
    if (message.messageType === 'image') {
      const imageUrl = message.fileUrl?.startsWith('http') ? message.fileUrl : `http://localhost:8000${message.fileUrl}`;
      return (
        <div className="space-y-2">
          <img 
            src={imageUrl} 
            alt={message.fileName || 'Image'} 
            className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90"
            onClick={() => window.open(imageUrl, '_blank')}
          />
          {message.content && (
            <div className="text-sm">
              {isLongMessage && !isExpanded ? (
                <div>
                  <span>{message.content.substring(0, 150)}...</span>
                  <button
                    onClick={() => toggleMessageExpansion(messageIndex)}
                    className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600"
                  >
                    Read more
                  </button>
                </div>
              ) : (
                <span className="whitespace-pre-wrap break-words">
                  {message.content}
                  {isLongMessage && isExpanded && (
                    <button
                      onClick={() => toggleMessageExpansion(messageIndex)}
                      className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600"
                    >
                      Show less
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    if (message.messageType === 'video') {
      const videoUrl = message.fileUrl?.startsWith('http') ? message.fileUrl : `http://localhost:8000${message.fileUrl}`;
      return (
        <div className="space-y-2">
          <video 
            controls 
            className="max-w-full max-h-64 rounded-lg"
            src={videoUrl}
          >
            Your browser does not support the video tag.
          </video>
          {message.content && (
            <div className="text-sm">
              {isLongMessage && !isExpanded ? (
                <div>
                  <span>{message.content.substring(0, 150)}...</span>
                  <button
                    onClick={() => toggleMessageExpansion(messageIndex)}
                    className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600"
                  >
                    Read more
                  </button>
                </div>
              ) : (
                <span className="whitespace-pre-wrap break-words">
                  {message.content}
                  {isLongMessage && isExpanded && (
                    <button
                      onClick={() => toggleMessageExpansion(messageIndex)}
                      className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600"
                    >
                      Show less
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    if (message.messageType === 'file') {
      const fileUrl = message.fileUrl?.startsWith('http') ? message.fileUrl : `http://localhost:8000${message.fileUrl}`;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{message.fileName}</div>
              <div className="text-xs text-gray-500">{formatFileSize(message.fileSize || 0)}</div>
            </div>
            <a 
              href={fileUrl} 
              download={message.fileName}
              className="p-2 text-blue-500 hover:text-blue-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </a>
          </div>
          {message.content && (
            <div className="text-sm">
              {isLongMessage && !isExpanded ? (
                <div>
                  <span>{message.content.substring(0, 150)}...</span>
                  <button
                    onClick={() => toggleMessageExpansion(messageIndex)}
                    className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600"
                  >
                    Read more
                  </button>
                </div>
              ) : (
                <span className="whitespace-pre-wrap break-words">
                  {message.content}
                  {isLongMessage && isExpanded && (
                    <button
                      onClick={() => toggleMessageExpansion(messageIndex)}
                      className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600"
                    >
                      Show less
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    // Text message
    if (!isLongMessage) {
      return <span className="whitespace-pre-wrap break-words">{message.content}</span>;
    }

    return (
      <div>
        <span className="whitespace-pre-wrap break-words">
          {isExpanded ? message.content : message.content.substring(0, 150) + "..."}
        </span>
        <button
          onClick={() => toggleMessageExpansion(messageIndex)}
          className="ml-2 text-sm font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {isExpanded ? "Show less" : "Read more"}
        </button>
      </div>
    );
  };

  const renderReplyPreview = (replyTo: ChatMessage) => {
    return (
      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-2 mb-2 border-l-4 border-blue-500">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Replying to {replyTo.user.username}
        </div>
        <div className="text-sm truncate">
          {replyTo.messageType === 'image' ? '📷 Image' :
           replyTo.messageType === 'video' ? '🎥 Video' :
           replyTo.messageType === 'file' ? '📎 File' :
           replyTo.content}
        </div>
      </div>
    );
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
    <div className="h-screen bg-white dark:bg-gray-900 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
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
      <div className="flex-1 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-0 md:gap-6 min-h-0">
        {/* Sidebar */}
        <aside className="hidden md:flex md:col-span-4 lg:col-span-3 border-r border-gray-200 dark:border-gray-800 flex-col bg-white dark:bg-gray-900 min-h-0">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Users</div>
            <div className="mt-3 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" /></svg>
              </span>
              <input
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div ref={userListRef} className="flex-1 overflow-y-auto p-2 min-h-0">
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 px-2 py-2">All Users</div>
            <div className="space-y-1">
              {allUsers
                .filter((u) =>
                  `${u.username} ${u.email}`.toLowerCase().includes(activeFilter.toLowerCase())
                )
                                 .map((u) => (
                   <div 
                     key={u.email} 
                     className={`flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${selectedUser?.id === u.id ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700' : ''}`}
                     onClick={() => handleUserSelect(u)}
                   >
                     <div className="relative">
                       <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200">
                         {u.username?.[0]?.toUpperCase()}
                       </div>
                       {isUserOnline(u.email) && (
                       <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900"></span>
                       )}
                     </div>
                     <div className="min-w-0">
                       <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{u.username}</div>
                       <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                     </div>
                     <div className="ml-auto text-[10px] text-gray-400">
                       {isUserOnline(u.email) ? "online" : "offline"}
                     </div>
                   </div>
                 ))}
              {allUsers.length === 0 && (
                <div className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">No users found</div>
              )}
            </div>
          </div>
        </aside>

        {/* Chat area */}
        <section className="md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
                     {/* Thread header */}
           <div className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 flex-shrink-0">
             <div className="flex items-center gap-3">
               {isDirectMessage ? (
                 <>
                   <div className="h-8 w-8 rounded-full bg-green-600 text-white flex items-center justify-center">
                     {selectedUser?.username?.[0]?.toUpperCase()}
                   </div>
                   <div>
                     <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                       {selectedUser?.username}
                     </div>
                     <div className="text-xs text-gray-500 dark:text-gray-400">
                       {isUserOnline(selectedUser?.email || '') ? "online" : "offline"}
                     </div>
                   </div>
                 </>
               ) : (
                 <>
                   <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center">G</div>
                   <div>
                     <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">General Chat</div>
                     <div className="text-xs text-gray-500 dark:text-gray-400">{onlineUsers.length} online • {allUsers.length} total</div>
                   </div>
                 </>
               )}
             </div>
             <div className="hidden sm:flex items-center gap-2 text-gray-500 dark:text-gray-400">
               {isDirectMessage && (
                 <button 
                   onClick={handleGeneralChat}
                   className="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                 >
                   General Chat
                 </button>
               )}
               <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Search in chat">
                 <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" /></svg>
               </button>
               <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="More">
                 <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6h.01M12 12h.01M12 18h.01" /></svg>
               </button>
             </div>
           </div>

          {/* Messages */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 bg-gray-50/60 dark:bg-gray-900 min-h-0"
          >
            {messages.map((m, idx) => (
              <div key={m.id || idx} className={`flex ${isOwn(m) ? "justify-end" : "justify-start"}`}>
                {!isOwn(m) && (
                  <div className="mr-2 mt-4 h-8 w-8 flex-shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200">
                    {m.user.username?.[0]?.toUpperCase()}
                  </div>
                )}
                                 <div className={`max-w-[78%] sm:max-w-[65%] ${isOwn(m) ? "items-end" : "items-start"} relative group`}>
                   {/* Reply preview */}
                   {m.replyTo && (
                     <div className="mb-1">
                       {renderReplyPreview(m.replyTo)}
                     </div>
                   )}
                   
                   <div className={`text-xs mb-1 px-1 text-gray-500 dark:text-gray-400 ${isOwn(m) ? "text-right" : "text-left"}`}>
                     <span className="font-medium text-gray-700 dark:text-gray-300">{m.user.username}</span>
                     <span className="mx-1">•</span>
                     <span>{formatTime(m.created_at)}</span>
                   </div>
                   
                   <div className={`${isOwn(m) ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"} rounded-2xl px-4 py-2 shadow-sm border ${isOwn(m) ? "border-blue-600" : "border-gray-200 dark:border-gray-700"} relative`}>
                     {renderMessageContent(m, idx)}
                     
                     {/* Message actions - positioned on the side like WhatsApp */}
                     <div className={`absolute ${isOwn(m) ? '-left-12' : '-right-12'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1`}>
                       <button
                         onClick={() => setReplyTo(m)}
                         className="p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 shadow-lg"
                         title="Reply"
                       >
                         <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                         </svg>
                       </button>
                       <button
                         onClick={() => setShowReactions(showReactions === m.id ? null : m.id || '')}
                         className="p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 shadow-lg"
                         title="React"
                       >
                         <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                         </svg>
                       </button>
                                               <button
                          onClick={() => deleteMessage(m.id || '')}
                          className="p-2 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                     </div>
                    
                    {/* Reactions */}
                    {m.reactions && m.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {m.reactions.map((reaction, rIdx) => (
                          <span key={rIdx} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-xs">
                            {reaction.emoji} {reaction.users.length}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                                     {/* Reaction picker */}
                   {showReactions === m.id && (
                     <div className={`absolute ${isOwn(m) ? '-left-12' : '-right-12'} -top-16 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 flex gap-1`}>
                       {commonEmojis.map((emoji, eIdx) => (
                         <button
                           key={eIdx}
                           onClick={() => addReaction(m.id || '', emoji)}
                           className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-lg"
                         >
                           {emoji}
                         </button>
                       ))}
                     </div>
                   )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex-shrink-0">
            {/* Reply preview */}
            {replyTo && (
              <div className="mb-2">
                {renderReplyPreview(replyTo)}
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕ Cancel reply
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50" 
                aria-label="Attach file"
              >
                {isUploading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                ) : (
                  <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15V8a5 5 0 10-10 0v9a3 3 0 106 0V9" />
                  </svg>
                )}
              </button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isConnected ? "Write a message..." : "Connecting..."}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={1}
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
                
                                 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                   <button 
                     onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                     className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" 
                     aria-label="Emoji"
                   >
                     <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM15.5 11v0M8.5 11v0M8 15s1.5 2 4 2 4-2 4-2" />
                     </svg>
                   </button>
                 </div>
                
                                 {/* Emoji picker */}
                 {showEmojiPicker && (
                   <div 
                     ref={emojiPickerRef}
                     className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2"
                   >
                     <div className="flex items-center justify-between mb-2 px-1">
                       <span className="text-xs text-gray-500 dark:text-gray-400">
                         Click emoji to add to message
                       </span>
                       <button
                         onClick={() => setShowEmojiPicker(false)}
                         className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                       >
                         ✕
                       </button>
                     </div>
                     <div className="grid grid-cols-8 gap-1">
                       {['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👵', '🧓', '👴', '👮‍♀️', '👮', '👮‍♂️', '🕵️‍♀️', '🕵️', '🕵️‍♂️', '💂‍♀️', '💂', '💂‍♂️', '👷‍♀️', '👷', '👷‍♂️', '🤴', '👸', '👳‍♀️', '👳', '👳‍♂️', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🧙‍♀️', '🧙', '🧙‍♂️', '🧝‍♀️', '🧝', '🧝‍♂️', '🧛‍♀️', '🧛', '🧛‍♂️', '🧟‍♀️', '🧟', '🧟‍♂️', '🧞‍♀️', '🧞', '🧞‍♂️', '🧜‍♀️', '🧜', '🧜‍♂️', '🧚‍♀️', '🧚', '🧚‍♂️', '👼', '🤰', '🤱', '👼', '🎅', '🤶', '🧙‍♀️', '🧙', '🧙‍♂️', '🧝‍♀️', '🧝', '🧝‍♂️', '🧛‍♀️', '🧛', '🧛‍♂️', '🧟‍♀️', '🧟', '🧟‍♂️', '🧞‍♀️', '🧞', '🧞‍♂️', '🧜‍♀️', '🧜', '🧜‍♂️', '🧚‍♀️', '🧚', '🧚‍♂️'].map((emoji, index) => (
                         <button
                           key={index}
                           onClick={() => addEmoji(emoji)}
                           className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-lg"
                         >
                           {emoji}
                         </button>
                       ))}
                     </div>
                     <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                       <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Quick send:</div>
                                               <div className="flex gap-1">
                          {['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🙏', '🔥', '💯'].map((emoji, index) => (
                            <button
                              key={index}
                              onClick={() => sendEmojiDirectly(emoji)}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-lg"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                     </div>
                   </div>
                 )}
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
