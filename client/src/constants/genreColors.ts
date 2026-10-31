/**
 * Centralized palette of Spotify-style genre banner colors.
 * Used consistently across GenreCarousel, MobileMainContent, and RadioView.
 */
export const SPOTIFY_GENRE_COLORS = [
  'bg-[#BA2500]',
  'bg-[#1E3264]',
  'bg-[#C20E4A]',
  'bg-[#0E6E06]',
  'bg-[#1960B8]',
  'bg-[#C42818]',
  'bg-[#944703]',
  'bg-[#5B3EE6]',
  'bg-[#6E428C]',
  'bg-[#2E586C]',
  'bg-[#BA0D72]',
  'bg-[#006450]',
] as const;

export function getSpotifyGenreColor(index: number): string {
  return SPOTIFY_GENRE_COLORS[index % SPOTIFY_GENRE_COLORS.length];
}
