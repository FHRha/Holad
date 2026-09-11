import { getHoladServerUrl } from '../utils/serverConfig';
import { useSettingsStore } from '../store/settingsStore';

export async function getExternalArtistStats(artistName: string) {
  const { useNavidrome, useLastFm, useYandex, lastFmKey, yandexToken } = useSettingsStore.getState();

  const params = new URLSearchParams();
  params.append('useNavidrome', (useNavidrome !== false).toString());
  params.append('useLastFm', Boolean(useLastFm).toString());
  params.append('useYandex', Boolean(useYandex).toString());
  if (lastFmKey) params.append('lastFmKey', lastFmKey);
  if (yandexToken) params.append('yandexToken', yandexToken);

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/stats/artist/${encodeURIComponent(artistName)}?${params.toString()}`);
    if (!res.ok) {
      throw new Error('Stats endpoint returned error');
    }
    return await res.json();
  } catch (error) {
    console.error('Failed to get external artist stats:', error);
    return { source: 'local', error: 'Network error or endpoint unavailable' };
  }
}

export async function getExternalAlbumStats(artistName: string, albumName: string) {
  const { useNavidrome, useLastFm, useYandex, lastFmKey, yandexToken } = useSettingsStore.getState();

  const params = new URLSearchParams();
  params.append('useNavidrome', (useNavidrome !== false).toString());
  params.append('useLastFm', Boolean(useLastFm).toString());
  params.append('useYandex', Boolean(useYandex).toString());
  if (lastFmKey) params.append('lastFmKey', lastFmKey);
  if (yandexToken) params.append('yandexToken', yandexToken);

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/stats/album/${encodeURIComponent(artistName)}/${encodeURIComponent(albumName)}?${params.toString()}`);
    if (!res.ok) {
      throw new Error('Stats endpoint returned error');
    }
    return await res.json();
  } catch (error) {
    console.error('Failed to get external album stats:', error);
    return { source: 'local', error: 'Network error or endpoint unavailable' };
  }
}
