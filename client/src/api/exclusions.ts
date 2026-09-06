import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';

const getHeaders = () => {
  const { user, token, salt, url } = useAuthStore.getState();
  return {
    'x-user': encodeURIComponent(user || ''),
    'x-token': encodeURIComponent(token || ''),
    'x-salt': encodeURIComponent(salt || ''),
    'x-url': encodeURIComponent(url || '')
  };
};

export interface ExclusionsResponse {
  excludedTrackIds: string[];
  excludedAlbumIds: string[];
}

export const fetchExclusions = async (): Promise<ExclusionsResponse> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) {
    return { excludedTrackIds: [], excludedAlbumIds: [] };
  }

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/exclusions/${encodeURIComponent(user)}`, {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    return {
      excludedTrackIds: Array.isArray(data?.excludedTrackIds) ? data.excludedTrackIds : [],
      excludedAlbumIds: Array.isArray(data?.excludedAlbumIds) ? data.excludedAlbumIds : []
    };
  } catch (error) {
    console.error('Failed to fetch exclusions:', error);
    return { excludedTrackIds: [], excludedAlbumIds: [] };
  }
};

export const syncToggleExclusion = async (entityId: string, entityType: 'track' | 'album'): Promise<boolean | null> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return null;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/exclusions/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders()
      },
      body: JSON.stringify({ entityId, entityType })
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    return data?.isExcluded ?? null;
  } catch (error) {
    console.error('Failed to sync toggle exclusion:', error);
    return null;
  }
};

export const syncSetExclusions = async (trackIds: string[], albumIds: string[]): Promise<boolean> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/exclusions/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders()
      },
      body: JSON.stringify({
        excludedTrackIds: trackIds,
        excludedAlbumIds: albumIds
      })
    });
    return res.ok;
  } catch (error) {
    console.error('Failed to sync set exclusions:', error);
    return false;
  }
};
