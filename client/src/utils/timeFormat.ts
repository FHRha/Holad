export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDurationVerbose(seconds: number, t: any): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  
  const pluralize = (count: number, key1: string, key2: string, key5: string) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 19) return t(key5);
    if (mod10 === 1) return t(key1);
    if (mod10 >= 2 && mod10 <= 4) return t(key2);
    return t(key5);
  };

  let res = [];
  if (h > 0) res.push(`${h} ${pluralize(h, 'views.hour_1', 'views.hour_2', 'views.hour_5')}`);
  if (m > 0 || h === 0) res.push(`${m} ${pluralize(m, 'views.min_1', 'views.min_2', 'views.min_5')}`);
  
  return res.join(' ');
}
