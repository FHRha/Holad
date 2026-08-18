import { useState, useEffect } from 'react';
import { networkManager } from '../utils/networkStatus';

export function useNetworkStatus() {
  const [online, setOnline] = useState<boolean>(networkManager.isOnline());

  useEffect(() => {
    setOnline(networkManager.isOnline());
    const unsubscribe = networkManager.subscribe((isConn) => {
      setOnline(isConn);
    });
    return unsubscribe;
  }, []);

  return {
    isOnline: online,
    isOffline: !online
  };
}
