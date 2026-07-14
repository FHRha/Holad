export interface LyricLine {
  time: number;
  text: string;
  isInterlude?: boolean;
}

export function injectInterludes(lines: LyricLine[]): LyricLine[] {
  const result: LyricLine[] = [];
  
  // Check for intro interlude
  if (lines.length > 0 && lines[0].time >= 7) {
    result.push({
      time: Math.max(0, lines[0].time - 3), // Start up to 3 seconds before first line
      text: '...',
      isInterlude: true
    });
  }

  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    if (i < lines.length - 1) {
      const curr = lines[i];
      const next = lines[i + 1];
      const gap = next.time - curr.time;
      if (gap >= 7) { // If gap is >= 7 seconds
        result.push({
          time: next.time - 3, // Start the dots exactly 3 seconds BEFORE the next line starts!
          text: '...',
          isInterlude: true
        });
      }
    }
  }
  return result;
}

export function parseLRC(lrc: string): LyricLine[] {
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:[:\.](\d{1,3}))?\](.*)/;

  lines.forEach(line => {
    const match = regex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3], 10) : 0;
      const milliseconds = match[3] ? (match[3].length === 1 ? ms * 100 : match[3].length === 2 ? ms * 10 : ms) : 0;
      const time = minutes * 60 + seconds + milliseconds / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time, text });
      }
    }
  });

  return injectInterludes(result.sort((a, b) => a.time - b.time));
}
