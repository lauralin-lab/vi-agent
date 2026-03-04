import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';

const IOS_SPRING = { type: 'spring', stiffness: 340, damping: 32 };

const PROVIDERS = [
  {
    key: 'google',
    name: 'Google',
    icon: 'G',
    iconBg: 'rgba(66,133,244,0.08)',
    iconColor: '#4285F4',
    scopes: ['Calendar', 'Drive', 'Gmail'],
  },
  {
    key: 'notion',
    name: 'Notion',
    icon: 'N',
    iconBg: 'rgba(0,0,0,0.06)',
    iconColor: '#000',
    scopes: ['Pages', 'Databases'],
  },
  {
    key: 'slack',
    name: 'Slack',
    icon: 'S',
    iconBg: 'rgba(74,21,75,0.08)',
    iconColor: '#4A154B',
    scopes: ['Messages', 'Channels'],
  },
];

const ConnectionCard = memo(function ConnectionCard({ provider, status, onConnect, onDisconnect, connecting, index }) {
  const isConnected = status?.connected === true;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ delay: index * 0.04, ...IOS_SPRING }}
      className="flex items-center gap-4"
      style={{
        background: '#fff',
        borderRadius: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
        padding: '16px 18px',
      }}
    >
      {/* Icon */}
      <div
        className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center font-bold"
        style={{
          background: provider.iconBg,
          color: provider.iconColor,
          fontSize: 20,
        }}
      >
        {provider.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="font-semibold truncate"
            style={{ fontSize: 16, color: '#000', letterSpacing: '-0.01em' }}
          >
            {provider.name}
          </p>
          {isConnected && (
            <span
              className="inline-block px-2 py-0.5 rounded-full font-medium"
              style={{
                fontSize: 11,
                color: 'rgba(52,199,89,0.8)',
                background: 'rgba(52,199,89,0.08)',
              }}
            >
              Connected
            </span>
          )}
        </div>
        <p
          className="truncate mt-0.5"
          style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)' }}
        >
          {provider.scopes.join(', ')}
        </p>
      </div>

      {/* Action button */}
      {isConnected ? (
        <button
          onClick={() => onDisconnect(provider.key)}
          className="shrink-0 px-4 py-1.5 rounded-full font-medium active:scale-95 transition-all"
          style={{
            fontSize: 13,
            color: 'rgba(255,59,48,0.7)',
            background: 'rgba(255,59,48,0.06)',
          }}
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => onConnect(provider.key)}
          disabled={connecting === provider.key}
          className="shrink-0 px-4 py-1.5 rounded-full font-semibold active:scale-95 transition-all disabled:opacity-50"
          style={{
            fontSize: 13,
            color: '#fff',
            background: '#000',
          }}
        >
          {connecting === provider.key ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            'Connect'
          )}
        </button>
      )}
    </motion.div>
  );
});

export default function ConnectionsView() {
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  const loadStatuses = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        PROVIDERS.map(p => api.getTokenStatus(p.key))
      );
      const newStatuses = {};
      PROVIDERS.forEach((p, i) => {
        newStatuses[p.key] = results[i].status === 'fulfilled' ? results[i].value : { connected: false };
      });
      setStatuses(newStatuses);
    } catch (e) {
      console.error('Failed to load token statuses:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadStatuses();
  }, [loadStatuses]);

  const handleConnect = useCallback(async (provider) => {
    setConnecting(provider);
    try {
      const data = await api.connectToken(provider);
      if (data?.authorization_url) {
        window.open(data.authorization_url, '_blank');
      }
    } catch (e) {
      console.error('Failed to connect provider:', e);
    } finally {
      setConnecting(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (provider) => {
    setDisconnecting(provider);
  }, []);

  const confirmDisconnect = useCallback(async () => {
    if (!disconnecting) return;
    try {
      await api.disconnectToken(disconnecting);
      setStatuses(prev => ({
        ...prev,
        [disconnecting]: { connected: false },
      }));
    } catch (e) {
      console.error('Failed to disconnect provider:', e);
    } finally {
      setDisconnecting(null);
    }
  }, [disconnecting]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(0,0,0,0.15)' }} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-24 flex flex-col relative">
      <p
        className="font-semibold uppercase tracking-wide px-2 mb-2"
        style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.06em' }}
      >
        Connected Services
      </p>
      <div className="space-y-2.5">
        <AnimatePresence>
          {PROVIDERS.map((provider, index) => (
            <ConnectionCard
              key={provider.key}
              provider={provider}
              status={statuses[provider.key]}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              connecting={connecting}
              index={index}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Disconnect confirmation bottom sheet */}
      <AnimatePresence>
        {disconnecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.25)' }}
            onClick={() => setDisconnecting(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={IOS_SPRING}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm mx-4 mb-8 overflow-hidden"
              style={{ borderRadius: 20, background: '#fff', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}
            >
              <div className="p-5 text-center">
                <p className="font-semibold mb-1" style={{ fontSize: 16, color: '#000' }}>
                  Disconnect {PROVIDERS.find(p => p.key === disconnecting)?.name}?
                </p>
                <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>
                  The agent will lose access to this service
                </p>
              </div>
              <div className="flex" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  onClick={() => setDisconnecting(null)}
                  className="flex-1 py-3.5 font-medium hover:bg-black/[0.02] transition-colors"
                  style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}
                >
                  Cancel
                </button>
                <div style={{ width: 1, background: 'rgba(0,0,0,0.06)' }} />
                <button
                  onClick={confirmDisconnect}
                  className="flex-1 py-3.5 font-semibold hover:bg-black/[0.02] transition-colors"
                  style={{ fontSize: 14, color: 'rgba(255,59,48,0.8)' }}
                >
                  Disconnect
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
