import { useRef, useEffect } from 'react';
import { useRoomConnection } from './useRoomConnection';
import { useAgentProtocol } from './useAgentProtocol';

/**
 * Composition hook: combines useRoomConnection + useAgentProtocol.
 * Preserves the exact same return interface as the original monolithic hook.
 */
export function useLiveKit() {
  // Shared refs owned by this composition layer
  const roomRef = useRef(null);
  const videoTrackRef = useRef(null);
  const agentIdentityRef = useRef(null);
  const audioContextRef = useRef(null);

  // Protocol layer (instantiated first to provide setupProtocol callback)
  const protocol = useAgentProtocol({ roomRef, videoTrackRef, agentIdentityRef });

  // Connection layer (calls protocol.setupProtocol during room creation, before connect)
  const connection = useRoomConnection({
    onRoomSetup: protocol.setupProtocol,
    roomRef,
    agentIdentityRef,
    audioContextRef,
  });

  // Keep videoTrackRef in sync with connection state
  useEffect(() => {
    videoTrackRef.current = connection.localVideoTrack;
  }, [connection.localVideoTrack]);

  // Destructure to exclude internal-only setupProtocol
  const { setupProtocol: _, ...protocolPublic } = protocol;

  return {
    ...connection,
    ...protocolPublic,
  };
}
