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

export interface ExclusionMetaInput {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number | string;
  duration?: number;
  fileName?: string;
  path?: string;
  lyrics?: string;
  lyricsHash?: string;
  fingerprint?: string;
}

export interface ExclusionsResponse {
  excludedTrackIds: string[];
  excludedAlbumIds: string[];
  excludedFingerprints?: string[];
}

export const fetchExclusions = async (): Promise<ExclusionsResponse | null> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) {
    return null;
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
      excludedAlbumIds: Array.isArray(data?.excludedAlbumIds) ? data.excludedAlbumIds : [],
      excludedFingerprints: Array.isArray(data?.excludedFingerprints) ? data.excludedFingerprints : []
    };
  } catch (error) {
    console.error('Failed to fetch exclusions:', error);
    return null;
  }
};

export const syncToggleExclusion = async (
  entityId: string, 
  entityType: 'track' | 'album',
  meta?: ExclusionMetaInput
): Promise<boolean | null> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return null;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/exclusions/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders()
      },
      body: JSON.stringify({ entityId, entityType, ...meta })
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

export const syncReconcileExclusion = async (
  oldId: string,
  newId: string,
  entityType: 'track' | 'album' = 'track',
  fingerprint?: string
): Promise<boolean> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/exclusions/${encodeURIComponent(user)}/reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders()
      },
      body: JSON.stringify({ oldId, newId, entityType, fingerprint })
    });
    return res.ok;
  } catch (error) {
    console.error('Failed to sync reconcile exclusion:', error);
    return false;
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
