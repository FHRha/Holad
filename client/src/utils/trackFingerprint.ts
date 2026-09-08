/**
 * Track Fingerprinting and Entity Resolution Utility
 * 
 * Provides deterministic hashing and multi-tiered fuzzy matching for tracks and albums.
 * Handles LRC vs Plain Text lyrics normalization, missing/dirty tags, and version/mashup distinction.
 */

export interface TrackMetadataInput {
  id?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumId?: string | null;
  artistId?: string | null;
  track?: number | string | null;
  trackNumber?: number | string | null;
  duration?: number | null;
  path?: string | null;
  fileName?: string | null;
  lyrics?: string | null;
  lyricsHash?: string | null;
  fingerprint?: string | null;
}

/**
 * 64-bit cyrb53 deterministic hash returning a hex string.
 * Fast, pure JavaScript, zero dependencies, identical in Node and Browser.
 */
export function stableHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Normalizes text for comparison: lowercases, trims, removes punctuation and extra spaces.
 */
export function cleanText(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Strips common release/version tags (e.g. "(Remastered 2011)", "[Bonus Track]").
 * Useful for soft semantic matching.
 */
export function stripVersionTags(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\s*[\(\[](?:remaster(?:ed)?|bonus|deluxe|expanded|anniversary|edit|mono|stereo|re-recorded|live|session).*?[\)\]]/gi, '')
    .trim();
}

/**
 * Normalizes lyrics by stripping LRC timestamps, metadata tags, and punctuation.
 * Produces identical output regardless of whether the source is .lrc or plain text!
 */
export function normalizeLyrics(rawLyrics?: string | null): string {
  if (!rawLyrics || typeof rawLyrics !== 'string') return '';

  return rawLyrics
    // Remove LRC timestamps like [01:23.45], [01:23:45], [01:23]
    .replace(/\[\d{1,3}:\d{2}(?:[:.]\d{1,3})?\]/g, '')
    // Remove LRC metadata tags like [ar: Artist], [ti: Title], [al: Album], [by: ...], [offset: 0]
    .replace(/\[[a-zA-Z]+:[^\]]*\]/g, '')
    // Normalize Unicode diacritics
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Convert to lowercase
    .toLowerCase()
    // Remove punctuation, symbols, whitespace
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/**
 * Generates a stable hash of the song's lyrics.
 * Returns null if lyrics are empty or too short (< 10 chars).
 */
export function generateLyricsHash(rawLyrics?: string | null): string | null {
  const normalized = normalizeLyrics(rawLyrics);
  if (normalized.length < 10) {
    return null;
  }
  // Take first 500 characters to protect against huge files while ensuring uniqueness
  const sample = normalized.slice(0, 500);
  return 'lyr_' + stableHash(sample);
}

/**
 * Extracts raw file name from path (e.g. "Music/Artist/01 Track.mp3" -> "01 Track").
 */
export function extractFileName(pathOrName?: string | null): string | null {
  if (!pathOrName || typeof pathOrName !== 'string') return null;
  const basename = pathOrName.replace(/^.*[\\\/]/, '');
  const withoutExt = basename.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
  const cleaned = cleanText(withoutExt);
  return cleaned || null;
}

/**
 * Normalizes track number (handles string "01", 1, "1/12", etc.)
 */
export function parseTrackNumber(val?: number | string | null): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return isNaN(val) || val <= 0 ? null : val;
  const match = String(val).match(/^\s*(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) || num <= 0 ? null : num;
  }
  return null;
}

/**
 * Generates a composite resilient fingerprint for a track.
 * 
 * Incorporates:
 * - Artist & Album & Title
 * - Track Number (crucial for distinguishing mashups/versions in the same album)
 * - Duration in seconds
 * - Lyrics Hash (if available)
 * - File Name (if available)
 */
export function generateTrackFingerprint(track: TrackMetadataInput): string {
  const artist = cleanText(track.artist);
  const album = cleanText(track.album);
  const title = cleanText(track.title);
  const trackNum = parseTrackNumber(track.track ?? track.trackNumber) ?? 0;
  const duration = Math.round(Number(track.duration) || 0);
  const lyricsH = track.lyricsHash || generateLyricsHash(track.lyrics) || '';
  const fileName = extractFileName(track.path ?? track.fileName) || '';

  // Multi-tier signature composition
  const payload = [
    artist,
    album,
    title,
    trackNum,
    duration,
    lyricsH,
    fileName
  ].join('|');

  return 'trk_' + stableHash(payload);
}

/**
 * Generates an album fingerprint for album-level entities.
 */
export function generateAlbumFingerprint(artist?: string | null, album?: string | null): string {
  const a = cleanText(artist);
  const al = cleanText(album);
  return 'alb_' + stableHash(`${a}|${al}`);
}

/**
 * Evaluates matching confidence between a saved entity and a candidate track in the library.
 * Returns a score between 0.0 (no match) and 1.0 (exact match).
 */
export function matchTrackConfidence(saved: TrackMetadataInput, candidate: TrackMetadataInput): number {
  // 1. Exact ID match
  if (saved.id && candidate.id && String(saved.id) === String(candidate.id)) {
    return 1.0;
  }

  // Exact composite fingerprint match
  const savedFp = saved.fingerprint || generateTrackFingerprint(saved);
  const candFp = candidate.fingerprint || generateTrackFingerprint(candidate);
  if (savedFp === candFp) {
    return 0.98;
  }

  const savedDuration = Math.round(Number(saved.duration) || 0);
  const candDuration = Math.round(Number(candidate.duration) || 0);
  const durationDiff = Math.abs(savedDuration - candDuration);

  // 2. Lyrics Hash Match (very strong when lyrics are present)
  const savedLyr = saved.lyricsHash || generateLyricsHash(saved.lyrics);
  const candLyr = candidate.lyricsHash || generateLyricsHash(candidate.lyrics);
  if (savedLyr && candLyr && savedLyr === candLyr) {
    if (durationDiff <= 2) return 0.96;
    if (durationDiff <= 5) return 0.90;
    return 0.85;
  }

  const savedArtist = cleanText(saved.artist);
  const candArtist = cleanText(candidate.artist);
  const savedAlbum = cleanText(saved.album);
  const candAlbum = cleanText(candidate.album);
  const savedTitle = cleanText(saved.title);
  const candTitle = cleanText(candidate.title);
  const savedTrackNum = parseTrackNumber(saved.track ?? saved.trackNumber);
  const candTrackNum = parseTrackNumber(candidate.track ?? candidate.trackNumber);

  // 3. Album + Track Number match (ideal for mashup albums like "пых-пых generational")
  if (savedAlbum && candAlbum && savedAlbum === candAlbum && savedTrackNum && candTrackNum && savedTrackNum === candTrackNum) {
    if (durationDiff <= 2) {
      if (savedTitle && candTitle && savedTitle === candTitle) return 0.95;
      return 0.90; // Same album, same track position, same duration
    }
  }

  // 4. File Name + Duration match (vital for dirty libraries with missing tags)
  const savedFile = extractFileName(saved.path ?? saved.fileName);
  const candFile = extractFileName(candidate.path ?? candidate.fileName);
  if (savedFile && candFile && savedFile === candFile && durationDiff <= 2) {
    return 0.92;
  }

  // 5. Semantic Match: Title + Artist + Duration
  if (savedTitle && candTitle && savedArtist && candArtist) {
    const titleMatch = savedTitle === candTitle || cleanText(stripVersionTags(savedTitle)) === cleanText(stripVersionTags(candTitle));
    const artistMatch = savedArtist === candArtist;

    if (titleMatch && artistMatch) {
      if (durationDiff <= 2) return 0.88;
      if (durationDiff <= 5) return 0.78;
    }
  }

  return 0.0;
}

/**
 * Checks whether a track is excluded by its ID, albumId, or fingerprint.
 */
export function isTrackExcluded(
  t?: TrackMetadataInput | null,
  excludedTrackIds: string[] = [],
  excludedAlbumIds: string[] = [],
  excludedFingerprints: string[] = []
): boolean {
  if (!t) return false;
  if (t.id && excludedTrackIds.includes(t.id)) return true;
  if (t.albumId && excludedAlbumIds.includes(t.albumId)) return true;
  if (excludedFingerprints && excludedFingerprints.length > 0) {
    if (t.fingerprint && excludedFingerprints.includes(t.fingerprint)) return true;
    const computed = generateTrackFingerprint(t);
    if (excludedFingerprints.includes(computed)) return true;
  }
  return false;
}

