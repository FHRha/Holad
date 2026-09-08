import { describe, it, expect } from 'vitest';
import {
  normalizeLyrics,
  generateLyricsHash,
  generateTrackFingerprint,
  generateAlbumFingerprint,
  matchTrackConfidence,
  cleanText,
  extractFileName,
  parseTrackNumber
} from '../../utils/trackFingerprint';

describe('Track Fingerprint & Resilient Library Reconciliation', () => {
  describe('1. Lyrics Normalization (LRC vs Plain Text)', () => {
    it('normalizes LRC with timestamps and metadata tags into clean plain text', () => {
      const lrc = `[ti:Пых-Пых]
[ar:Generational Artist]
[al:Пых-Пых Generational]
[00:01.50]Первая строчка текста
[00:05.80]Вторая строчка текста!
[00:10.00]Припев песни, пых пых...`;

      const plainText = `Первая строчка текста
Вторая строчка текста!
Припев песни, пых пых...`;

      const normalizedLrc = normalizeLyrics(lrc);
      const normalizedPlain = normalizeLyrics(plainText);

      expect(normalizedLrc).toBe(normalizedPlain);
      expect(normalizedLrc.length).toBeGreaterThan(15);
    });

    it('generates identical lyrics hash for LRC and Plain Text versions of the same song', () => {
      const lrc = `[00:12.34]Yeah we are riding through the night
[00:16.78]Nothing can stop our music today`;

      const plain = `Yeah we are riding through the night Nothing can stop our music today`;

      const hashLrc = generateLyricsHash(lrc);
      const hashPlain = generateLyricsHash(plain);

      expect(hashLrc).toBeTruthy();
      expect(hashLrc).toBe(hashPlain);
    });

    it('generates different hashes for different song lyrics', () => {
      const lyrics1 = 'Some completely different lyrics for track one that tells a story.';
      const lyrics2 = 'Another set of words and rhymes for track two with alternate vocal.';

      expect(generateLyricsHash(lyrics1)).not.toBe(generateLyricsHash(lyrics2));
    });

    it('returns null for empty or trivial lyrics', () => {
      expect(generateLyricsHash('')).toBeNull();
      expect(generateLyricsHash('   ...  ')).toBeNull();
      expect(generateLyricsHash(null)).toBeNull();
    });
  });

  describe('2. Album Versions & Mashups ("пых-пых generational")', () => {
    const originalTrack = {
      id: 'subsonic-101',
      title: 'пых-пых',
      artist: 'FHR',
      album: 'пых-пых generational',
      track: 1,
      duration: 214,
      lyrics: 'Оригинальный текст трека пых пых про жизнь и музыку'
    };

    const mashup1 = {
      id: 'subsonic-102',
      title: 'пых-пых',
      artist: 'FHR',
      album: 'пых-пых generational',
      track: 2,
      duration: 185, // Different duration
      lyrics: 'Текст первого мешапа с наложенным битом и новым куплетом'
    };

    const speedUpVersion = {
      id: 'subsonic-103',
      title: 'пых-пых (Speed Up)',
      artist: 'FHR',
      album: 'пых-пых generational',
      track: 3,
      duration: 160,
      lyrics: 'Оригинальный текст трека пых пых про жизнь и музыку'
    };

    it('generates unique fingerprints for original, mashups and alternate versions in the same album', () => {
      const fpOriginal = generateTrackFingerprint(originalTrack);
      const fpMashup = generateTrackFingerprint(mashup1);
      const fpSpeedUp = generateTrackFingerprint(speedUpVersion);

      expect(fpOriginal).not.toBe(fpMashup);
      expect(fpOriginal).not.toBe(fpSpeedUp);
      expect(fpMashup).not.toBe(fpSpeedUp);
    });

    it('correctly matches a re-indexed mashup when Subsonic assigns it a new ID', () => {
      const reIndexedMashup = {
        id: 'subsonic-new-999', // NEW ID after rescan!
        title: 'пых-пых',
        artist: 'FHR',
        album: 'пых-пых generational',
        trackNumber: 2,
        duration: 185,
        lyrics: '[00:00.00]Текст первого мешапа с наложенным битом и новым куплетом'
      };

      // Candidate matching confidence should be very high (>= 0.95)
      const confidence = matchTrackConfidence(mashup1, reIndexedMashup);
      expect(confidence).toBeGreaterThanOrEqual(0.95);

      // Confidence matching original against the mashup should be low (0)
      const wrongMatchConfidence = matchTrackConfidence(originalTrack, reIndexedMashup);
      expect(wrongMatchConfidence).toBeLessThan(0.8);
    });
  });

  describe('3. Dirty Library Tolerance (Missing or Inconsistent Tags)', () => {
    it('matches tracks with missing album/artist if fileName and duration match', () => {
      const savedWithFullTags = {
        id: 'old-id-55',
        title: 'Cyberpunk Anthem',
        artist: 'Future Band',
        album: 'Neon City',
        duration: 240,
        path: 'Music/Electronic/Cyberpunk_Anthem_Final.flac'
      };

      const dirtyCandidate = {
        id: 'new-id-77',
        title: 'Unknown Title',
        artist: '',
        album: null,
        duration: 241, // 1 second difference
        path: 'D:/Music/Downloads/Cyberpunk_Anthem_Final.mp3' // Same filename!
      };

      const confidence = matchTrackConfidence(savedWithFullTags, dirtyCandidate);
      expect(confidence).toBeGreaterThanOrEqual(0.90);
    });

    it('extracts clean file names accurately across slash conventions', () => {
      expect(extractFileName('C:\\Music\\Album\\01 - Song.mp3')).toBe('01 song');
      expect(extractFileName('/var/media/tracks/cool_beat.flac')).toBe('cool beat');
      expect(extractFileName(null)).toBeNull();
    });

    it('parses track numbers from various dirty tag representations', () => {
      expect(parseTrackNumber(1)).toBe(1);
      expect(parseTrackNumber('05')).toBe(5);
      expect(parseTrackNumber('12/24')).toBe(12);
      expect(parseTrackNumber('invalid')).toBeNull();
      expect(parseTrackNumber(null)).toBeNull();
    });
  });

  describe('4. Album Fingerprints', () => {
    it('generates consistent album fingerprints regardless of casing or extra spacing', () => {
      const fp1 = generateAlbumFingerprint('Michael Jackson', 'Thriller');
      const fp2 = generateAlbumFingerprint('  michael   jackson  ', 'THRILLER  ');
      expect(fp1).toBe(fp2);
    });
  });
});
