import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';

const getHeaders = () => {
  const { user, token, salt, url } = useAuthStore.getState();
  return {
    'Content-Type': 'application/json',
    'x-user': encodeURIComponent(user || ''),
    'x-token': encodeURIComponent(token || ''),
    'x-salt': encodeURIComponent(salt || ''),
    'x-url': encodeURIComponent(url || '')
  };
};

export interface ServerIntegrationItem {
  integration_name: string;
  token?: string | null;
  enabled?: boolean;
  updated_at?: number;
}

export async function fetchIntegrations(): Promise<ServerIntegrationItem[]> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return [];

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/integrations/${encodeURIComponent(user)}`, {
      headers: getHeaders()
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[Integrations] Fetch error:', err);
    return [];
  }
}

export async function pushIntegrations(items: ServerIntegrationItem[]): Promise<boolean> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/integrations/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(items)
    });
    return res.ok;
  } catch (err) {
    console.error('[Integrations] Push error:', err);
    return false;
  }
}
