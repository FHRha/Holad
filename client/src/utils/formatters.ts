export function formatArtistName(artistString: string | undefined | null): string {
  if (!artistString) return '';
  
  // Split by ;, /, ,, •, feat., ft.
  const parts = artistString.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i)
    .map(p => p.trim())
    .filter(p => p.length > 0);
    
  if (parts.length === 0) return artistString;
  if (parts.length === 1) return parts[0];
  
  // Join all with comma, except the last one with &
  const last = parts.pop();
  return parts.join(', ') + ' & ' + last;
}
