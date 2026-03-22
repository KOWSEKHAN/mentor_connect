import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { socket } from '../../socket';
import { useAuth } from '../../utils/auth';
import { useCommunityUnread } from '../../context/CommunityUnreadContext';
import EmojiPicker from 'emoji-picker-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export default function CommunityChat() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { incrementUnread, resetUnread } = useCommunityUnread();
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [editMessageId, setEditMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isFocusedRef = useRef(true);
  const communityJoinedRef = useRef(false);
  const currentUserId = user?._id || user?.id;
  const courseId = new URLSearchParams(window.location.search).get('courseId') || 'global';

  useEffect(() => {
    resetUnread();
  }, [resetUnread]);

  useEffect(() => {
    if (!courseId) return
    console.log('Joining community room:', courseId)
    socket.emit('joinCommunityRoom', { courseId })
  }, [courseId])

  useEffect(() => {
    api.get('/api/community/messages')
      .then((res) => setMessages(res.data?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const joinCommunity = () => {
      if (communityJoinedRef.current || !courseId) return;
      console.log('Joining community room:', courseId);
      communityJoinedRef.current = true;
      socket.emit('joinCommunityRoom', { courseId });
    };

    const onConnected = () => joinCommunity();
    socket.on('connected', onConnected);
    if (socket.connected) joinCommunity();

    return () => {
      socket.off('connected', onConnected);
      communityJoinedRef.current = false;
    };
  }, [courseId, currentUserId]);

  useEffect(() => {
    const handleMessage = (msg) => {
      console.log('Community message received:', msg);
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(msg._id))) return prev;
        return [...prev, msg];
      });
      if (!isFocusedRef.current) incrementUnread();
    };
    const handleUsersOnline = (users) =>
      setOnlineUsers(Array.isArray(users) ? users : []);
    const handleTyping = ({ userId, name }) => {
      if (!userId) return;
      setTypingUsers((prev) => new Map(prev).set(userId, name || 'Someone'));
    };
    const handleStopTyping = ({ userId }) => {
      if (!userId) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };
    const handleMessageEdit = (msg) => {
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(msg._id) ? { ...m, ...msg } : m))
      );
      setEditMessageId((id) => (String(id) === String(msg._id) ? null : id));
    };
    const handleMessageDelete = ({ messageId }) =>
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(messageId) ? { ...m, deleted: true, message: '[deleted]' } : m
        )
      );
    const handleReaction = (msg) =>
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(msg._id) ? { ...m, reactions: msg.reactions || [] } : m
        )
      );

    socket.on('newCommunityMessage', handleMessage);
    socket.on('community_users_online', handleUsersOnline);
    socket.on('community_typing', handleTyping);
    socket.on('community_stop_typing', handleStopTyping);
    socket.on('community_message_edit', handleMessageEdit);
    socket.on('community_message_delete', handleMessageDelete);
    socket.on('community_reaction', handleReaction);

    return () => {
      socket.off('newCommunityMessage', handleMessage);
      socket.off('community_users_online', handleUsersOnline);
      socket.off('community_typing', handleTyping);
      socket.off('community_stop_typing', handleStopTyping);
      socket.off('community_message_edit', handleMessageEdit);
      socket.off('community_message_delete', handleMessageDelete);
      socket.off('community_reaction', handleReaction);
    };
  }, [incrementUnread]);

  useEffect(() => {
    const onFocus = () => {
      isFocusedRef.current = true;
      resetUnread();
    };
    const onBlur = () => { isFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [resetUnread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !currentUserId || !courseId) return;
    console.log('Sending community message:', text);
    setShowEmoji(false);
    socket.emit('sendCommunityMessage', {
      courseId,
      senderId: currentUserId,
      senderName: user?.name,
      senderRole: user?.role,
      text,
    });
    setMessages((prev) => [
      ...prev,
      {
        _id: `temp-${Date.now()}`,
        courseId,
        senderId: currentUserId,
        senderName: user?.name,
        senderRole: user?.role,
        message: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput('');
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit('community_stop_typing');
  }, [input, currentUserId, courseId, user?.name, user?.role]);

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    if (e.target.value.trim()) socket.emit('community_typing');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('community_stop_typing');
      typingTimeoutRef.current = null;
    }, 1200);
  }, []);

  const handleEmojiClick = useCallback((emojiData) => {
    const emoji = emojiData?.emoji || '';
    if (emoji) setInput((prev) => prev + emoji);
  }, []);

  const handleReaction = useCallback((messageId, emoji) => {
    socket.emit('community_reaction', { messageId, emoji });
    setMenuMessageId(null);
  }, []);

  const handleEdit = useCallback((msg) => {
    setEditMessageId(msg._id);
    setEditText(msg.message || '');
    setMenuMessageId(null);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editMessageId || !editText.trim()) return;
    socket.emit('community_message_edit', { messageId: editMessageId, message: editText.trim() });
    setEditMessageId(null);
    setEditText('');
  }, [editMessageId, editText]);

  const handleCancelEdit = useCallback(() => {
    setEditMessageId(null);
    setEditText('');
  }, []);

  const handleDelete = useCallback((messageId) => {
    socket.emit('community_message_delete', messageId);
  }, []);

  const handleBack = useCallback(() => {
    navigate(user?.role === 'mentor' ? '/mentor' : '/mentee');
  }, [navigate, user?.role]);

  const isOwn = useCallback(
    (msg) => msg.senderId && String(msg.senderId) === String(currentUserId),
    [currentUserId]
  );

  const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
      <Header />
      <div className="flex flex-1 min-h-0">
        {/* Room list - Discord style */}
        <div className="w-[220px] flex-shrink-0 bg-slate-950/80 backdrop-blur border-r border-slate-800 flex flex-col">
          <div className="p-4 border-b border-slate-800">
            <button
              type="button"
              onClick={handleBack}
              className="text-sm text-indigo-400 hover:text-indigo-300 mb-3 transition-colors"
            >
              ← Back to Dashboard
            </button>
            <h2 className="font-semibold text-lg text-white">Community</h2>
            <p className="text-xs text-slate-400 mt-1">Global chat</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Online — {onlineUsers.length}
            </h3>
            {onlineUsers.length === 0 ? (
              <p className="text-sm text-slate-500">No one online</p>
            ) : (
              onlineUsers.map((u) => (
                <div
                  key={u.userId || u.socketId}
                  className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm truncate text-slate-200">{u.name || 'Unknown'}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      u.role === 'mentor' ? 'bg-indigo-600/60 text-indigo-200' : 'bg-green-600/60 text-green-200'
                    }`}
                  >
                    {u.role || 'mentee'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat center - scrollable */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
            {loading ? (
              <div className="flex items-center justify-center h-32 text-slate-500">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                <p>No messages yet.</p>
                <p className="text-sm mt-1">Be the first to say hello!</p>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.deleted) {
                  return (
                    <div key={msg._id} className="text-slate-500 text-sm italic py-1">
                      [Message deleted]
                    </div>
                  )
                }
                const own = isOwn(msg)
                return (
                  <div
                    key={msg._id}
                    className={`group flex ${own ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] ${own ? 'order-2' : ''}`}>
                      {editMessageId && String(editMessageId) === String(msg._id) ? (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-2">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            autoFocus
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="text-xs px-2 py-1 bg-indigo-600 rounded-lg hover:bg-indigo-700"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="text-xs px-2 py-1 bg-slate-600 rounded-lg hover:bg-slate-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`relative rounded-2xl px-4 py-2 ${
                            own ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-medium text-sm">
                              {own ? 'You' : msg.senderName || 'Unknown'}
                            </span>
                            <span
                              className={`text-xs px-1 rounded ${
                                msg.senderRole === 'mentor' ? 'bg-blue-500/50' : 'bg-green-500/50'
                              }`}
                            >
                              {msg.senderRole || 'mentee'}
                            </span>
                            <span className="text-xs text-slate-400">
                              {msg.createdAt &&
                                new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                            </span>
                            {own && (
                              <div className="ml-auto opacity-0 group-hover:opacity-100 transition">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMenuMessageId((id) =>
                                      String(id) === String(msg._id) ? null : msg._id
                                    )
                                  }
                                  className="text-slate-300 hover:text-white p-0.5"
                                >
                                  ⋮
                                </button>
                                {menuMessageId && String(menuMessageId) === String(msg._id) && (
                                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 py-1 min-w-[100px]">
                                    <button
                                      type="button"
                                      onClick={() => handleEdit(msg)}
                                      className="block w-full text-left px-3 py-1 text-sm hover:bg-slate-700 rounded-lg"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(msg._id)}
                                      className="block w-full text-left px-3 py-1 text-sm hover:bg-slate-700 text-red-400 rounded-lg"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.message}
                            {msg.edited && (
                              <span className="text-xs text-slate-400 ml-1">(edited)</span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(msg.reactions || []).map((r, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => handleReaction(msg._id, r.emoji)}
                                className="text-sm px-1.5 py-0.5 bg-white/10 rounded-lg hover:bg-white/20"
                                title={`${r.users?.length || 0} reacted`}
                              >
                                {r.emoji} {r.users?.length > 0 ? r.users.length : ''}
                              </button>
                            ))}
                            {!own && (
                              <button
                                type="button"
                                onClick={() =>
                                  setMenuMessageId((id) =>
                                    String(id) === String(msg._id) ? null : msg._id
                                  )
                                }
                                className="opacity-0 group-hover:opacity-100 text-sm px-1 hover:bg-white/10 rounded"
                              >
                                😀
                              </button>
                            )}
                            {menuMessageId && String(menuMessageId) === String(msg._id) && !own && (
                              <div className="flex gap-0.5">
                                {REACT_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleReaction(msg._id, emoji)}
                                    className="text-sm hover:scale-125 transition-transform"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            {typingUsers.size > 0 && (
              <div className="flex items-center gap-1 text-sm text-slate-400 italic py-1">
                <span>{Array.from(typingUsers.values()).slice(0, 3).join(', ')} typing</span>
                <span className="flex gap-0.5">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex-shrink-0">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message..."
                  className="w-full px-4 py-3 pr-12 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={() => setShowEmoji((s) => !s)}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    😀
                  </button>
                  {showEmoji && (
                    <div className="absolute bottom-full right-0 mb-2 z-20">
                      <EmojiPicker onEmojiClick={handleEmojiClick} theme="dark" />
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex-shrink-0 transition-all"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Members panel - Discord style */}
        <div className="w-[260px] flex-shrink-0 bg-slate-950/80 backdrop-blur border-l border-slate-800 flex flex-col p-4">
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Members — {onlineUsers.length}</h3>
          {onlineUsers.length === 0 ? (
            <p className="text-sm text-slate-500">No one online</p>
          ) : (
            <div className="space-y-2">
              {onlineUsers.map((u) => (
                <div key={u.userId || u.socketId} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm truncate text-slate-200">{u.name || 'Unknown'}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${u.role === 'mentor' ? 'bg-indigo-600/60' : 'bg-green-600/60'}`}>
                    {u.role || 'mentee'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
