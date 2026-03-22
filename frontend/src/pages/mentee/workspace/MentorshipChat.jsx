import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../../utils/api';
import { socket } from '../../../socket';
import { useAuth } from '../../../utils/auth';

function MessageBubble({ message, isOwn, onSeen, children }) {
  const ref = useRef(null);
  const seenEmitted = useRef(false);
  useEffect(() => {
    if (isOwn || !onSeen || !message._id || seenEmitted.current) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !seenEmitted.current) {
          seenEmitted.current = true;
          onSeen(message._id);
        }
      },
      { threshold: 0.5, rootMargin: '0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [message._id, isOwn, onSeen]);
  return <div ref={ref} className="inline-block">{children}</div>;
}

export default function MentorshipChat({ course, mentorshipId, userId, userName }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mentorshipIdRef = useRef(mentorshipId);
  const currentUserIdRef = useRef(null);
  const readSentForRef = useRef(new Set());

  const mentorId = course?.mentor?._id || course?.mentor;
  const menteeId = course?.mentee?._id || course?.mentee || user?._id || userId;
  const mentorName = course?.mentor?.name || 'No mentor assigned yet';
  const currentUserId = userId || user?._id || user?.id;
  const otherUserId = currentUserId && (currentUserId === mentorId ? menteeId : mentorId);
  const otherUserOnline = otherUserId && onlineUserIds.has(otherUserId);
  const otherUserLabel = currentUserId === mentorId ? 'Mentee' : 'Mentor';

  mentorshipIdRef.current = mentorshipId;
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    const onOnline = (uid) => setOnlineUserIds((prev) => new Set(prev).add(uid));
    const onOffline = (uid) =>
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    socket.on('user_online', onOnline);
    socket.on('user_offline', onOffline);
    return () => {
      socket.off('user_online', onOnline);
      socket.off('user_offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !mentorshipId) return;

    const onConnected = () => {
      setConnected(true);
      socket.emit('joinRoom', { mentorshipId });
    };
    socket.on('connected', onConnected);
    if (socket.connected) onConnected();

    return () => {
      socket.off('connected', onConnected);
      socket.emit('leave_chat', { mentorshipId });
    };
  }, [currentUserId, mentorshipId]);

  useEffect(() => {
    if (!mentorshipId) return;
    readSentForRef.current = new Set();

    api.get(`/api/messages/${mentorshipId}`)
      .then((res) => setMessages(res.data?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));

    if (currentUserIdRef.current) {
      socket.emit('message_seen', { mentorshipId, chatId: mentorshipId, userId: currentUserIdRef.current });
    }

    const onReceive = (message) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev;
        return [...prev, { ...message, status: message.status || 'sent' }];
      });
      setIsTyping(false);
    };
    const onDelivered = ({ messageId, status }) =>
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, status: status || 'delivered' } : m))
      );
    const onSeen = () =>
      setMessages((prev) =>
        prev.map((m) => {
          const isMine = String(m.senderId) === String(currentUserIdRef.current);
          return isMine ? { ...m, status: 'seen' } : m;
        })
      );
    const onReadUpdate = ({ messageId, userId }) =>
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, status: 'seen', readBy: [...(m.readBy || []), userId] } : m
        )
      );
    const onTyping = (typingUserId) => {
      if (typingUserId === otherUserId) setIsTyping(true);
    };
    const onStopTyping = (typingUserId) => {
      if (typingUserId === otherUserId) setIsTyping(false);
    };

    socket.on('receive_message', onReceive);
    socket.on('message_delivered', onDelivered);
    socket.on('messages_seen', onSeen);
    socket.on('message_read_update', onReadUpdate);
    socket.on('user_typing', onTyping);
    socket.on('user_stop_typing', onStopTyping);
    socket.on('typing', onTyping);
    socket.on('stop_typing', onStopTyping);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message_delivered', onDelivered);
      socket.off('messages_seen', onSeen);
      socket.off('message_read_update', onReadUpdate);
      socket.off('user_typing', onTyping);
      socket.off('user_stop_typing', onStopTyping);
      socket.off('typing', onTyping);
      socket.off('stop_typing', onStopTyping);
    };
  }, [mentorshipId, otherUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !mentorshipId || !currentUserId) return;
    const messageText = input.trim();
    setInput('');
    const senderRole = mentorId && currentUserId === mentorId ? 'mentor' : 'mentee';
    socket.emit('send_message', {
      mentorshipId,
      chatId: mentorshipId,
      senderId: currentUserId,
      senderRole,
      text: messageText,
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setIsTyping(false);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    if (!mentorshipId) return;
    if (value.trim()) socket.emit('typing', { chatId: mentorshipId, mentorshipId, userId: currentUserId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { chatId: mentorshipId, mentorshipId, userId: currentUserId });
      typingTimeoutRef.current = null;
    }, 1000);
  };

  const handleMessageSeen = useCallback((messageId) => {
    const uid = currentUserIdRef.current;
    if (!uid || !messageId || readSentForRef.current.has(messageId)) return;
    readSentForRef.current.add(messageId);
    socket.emit('message_read', { messageId, userId: uid });
  }, []);

  const renderStatusTicks = (msg) => {
    if (String(msg.senderId) !== String(currentUserId)) return null;
    const status = msg.status || 'sent';
    if (status === 'seen') return <span className="ml-1 text-indigo-300" title="Seen">✓✓</span>;
    if (status === 'delivered') return <span className="ml-1 text-slate-400" title="Delivered">✓✓</span>;
    return <span className="ml-1 text-slate-400" title="Sent">✓</span>;
  };

  if (!mentorshipId) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 h-full flex items-center justify-center">
        <p className="text-slate-400 text-sm">No mentorship found. Please wait for mentor assignment.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-white">Chat with {mentorName}</h3>
        <div className="flex items-center gap-2">
          {otherUserOnline && (
            <span className="text-xs text-green-400" title={`${otherUserLabel} is online`}>● Online</span>
          )}
          {connected ? (
            <span className="text-xs text-green-400">● Connected</span>
          ) : (
            <span className="text-xs text-slate-500">● Offline</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mb-3 space-y-2 p-2 border border-slate-700 rounded-xl bg-slate-900/50">
        {loading ? (
          <div className="text-center text-slate-500 py-4 text-sm">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-500 py-4 text-sm">No messages yet. Start a conversation!</div>
        ) : (
          messages.map((msg) => {
            const isOwn = String(msg.senderId) === String(currentUserId);
            return (
              <div key={msg._id || msg.timestamp} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <MessageBubble message={msg} isOwn={isOwn} onSeen={handleMessageSeen}>
                  <div
                    className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                      isOwn ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white'
                    }`}
                  >
                    <div className="font-medium text-xs mb-1 opacity-90">{isOwn ? 'You' : msg.from || 'Unknown'}</div>
                    <div className="whitespace-pre-wrap break-words">{msg.message || msg.text}</div>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {msg.timestamp && (
                        <span className={`text-xs ${isOwn ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                      {renderStatusTicks(msg)}
                    </div>
                  </div>
                </MessageBubble>
              </div>
            );
          })
        )}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-300 px-4 py-2 rounded-2xl text-sm flex items-center gap-1">
              <span>{otherUserLabel} is typing</span>
              <span className="flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="Type a message..."
          className="flex-1 p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-all"
        >
          Send
        </button>
      </div>
    </div>
  );
}
