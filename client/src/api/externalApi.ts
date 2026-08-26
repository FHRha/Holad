export async function getExternalArtistStats(artistName: string) {
  const useNavidrome = localStorage.getItem('useNavidrome') !== 'false';
  const useLastFm = localStorage.getItem('useLastFm') === 'true';
  const useYandex = localStorage.getItem('useYandex') === 'true';
  const lastFmKey = localStorage.getItem('lastFmKey') || '';
  const yandexToken = localStorage.getItem('yandexToken') || '';

  const params = new URLSearchParams();
  params.append('useNavidrome', useNavidrome.toString());
  params.append('useLastFm', useLastFm.toString());
  params.append('useYandex', useYandex.toString());
  if (lastFmKey) params.append('lastFmKey', lastFmKey);
  if (yandexToken) params.append('yandexToken', yandexToken);

  try {
    const res = await fetch(`/api/stats/artist/${encodeURIComponent(artistName)}?${params.toString()}`);
    if (!res.ok) {
      throw new Error('Stats endpoint returned error');
    }
    return await res.json();
  } catch (error) {
    console.error('Failed to get external artist stats:', error);
    return { source: 'local', error: 'Network error or endpoint unavailable' };
  }
}
