/**
 * ConversationModule — threaded conversation view with message input.
 * Slots: topic, messages[], input_placeholder, resolved
 * messages[]: { role: user|ai, content, timestamp }
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, MessageCircle } from 'lucide-react';
import {
  GlassCard, GlassSection, ModuleHeader, AccentBar,
} from './shared';

function MessageBubble({ role, content, timestamp }) {
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`
          max-w-[80%] rounded-2xl px-3.5 py-2.5
          ${isUser
            ? 'bg-blue-500/20 border border-blue-500/20 rounded-br-md'
            : 'bg-white/[0.06] border border-white/[0.08] rounded-bl-md'
          }
        `}
      >
        <p
          className={isUser ? 'text-blue-200/90' : 'text-white/70'}
          style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5 }}
        >
          {content}
        </p>
        {timestamp && (
          <p
            className={`mt-1 ${isUser ? 'text-blue-300/30 text-right' : 'text-white/20'}`}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            {timestamp}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function CollapsedSummary({ messages }) {
  const msgCount = messages.length;
  const lastMsg = messages[msgCount - 1];
  return (
    <GlassSection>
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle size={12} className="text-white/30" />
        <span className="text-white/40" style={{ fontSize: 'var(--text-xs)' }}>
          Conversation ended ({msgCount} message{msgCount !== 1 ? 's' : ''})
        </span>
      </div>
      {lastMsg && (
        <p className="text-white/50 line-clamp-2" style={{ fontSize: 'var(--text-sm)' }}>
          {lastMsg.content}
        </p>
      )}
    </GlassSection>
  );
}

export default function ConversationModule({ data, onAction }) {
  const {
    topic, messages = [], input_placeholder = 'Type a message...',
    resolved,
  } = data || {};

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content) return;
    setInputValue('');
    onAction?.({ type: 'message_sent', content });
  }, [inputValue, onAction]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!data) return null;

  // Collapsed mode when resolved
  if (resolved) {
    return (
      <GlassCard>
        <ModuleHeader title={topic || 'Conversation'} icon="💬" />
        <CollapsedSummary messages={messages} />
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <ModuleHeader title={topic || 'Conversation'} icon="💬" />

      {/* Messages */}
      <div
        className="space-y-2.5 overflow-y-auto scrollbar-none mb-3"
        style={{ maxHeight: 300 }}
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <AccentBar />

      {/* Input */}
      <div className="flex items-center gap-2 mt-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={input_placeholder}
          className="
            flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl
            px-3.5 py-2.5 text-white/80 placeholder-white/25
            focus:outline-none focus:border-purple-500/30
            transition-colors
          "
          style={{ fontSize: 'var(--text-sm)' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className={`
            w-10 h-10 rounded-xl flex items-center justify-center
            transition-all duration-200
            ${inputValue.trim()
              ? 'bg-purple-500/25 border border-purple-500/30 text-purple-300 hover:bg-purple-500/35'
              : 'bg-white/[0.04] border border-white/[0.06] text-white/20'
            }
          `}
        >
          <Send size={16} />
        </button>
      </div>
    </GlassCard>
  );
}
