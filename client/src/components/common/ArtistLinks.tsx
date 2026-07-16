import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';

interface ArtistLinksProps {
  artistString: string | undefined | null;
  artistId?: string;
  className?: string;
  onLinkClick?: () => void;
}

export default function ArtistLinks({ artistString, artistId, className = "", onLinkClick }: ArtistLinksProps) {
  const navigate = useNavigate();

  if (!artistString) return null;

  // Split by ;, /, ,, •, feat., ft., &
  const parts = artistString.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s*&\s*|\s+x\s+/i)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (parts.length === 0) {
    return <span className={className}>{artistString}</span>;
  }

  const handleArtistClick = (e: React.MouseEvent, index: number, artistName: string) => {
    e.stopPropagation();
    e.preventDefault();

    const isJam = window.location.pathname.startsWith('/jam');
    const searchParams = new URLSearchParams(window.location.search);
    const room = searchParams.get('room');
    
    if (index === 0 && artistId) {
       if (onLinkClick) onLinkClick(); // Close search overlay if passed
       const path = `/artist/${artistId}`;
       if (isJam && room) {
          navigate(`/jam/library${path}?room=${room}`);
       } else {
          navigate(`/Holad${path}`);
       }
       useUIStore.getState().setSearchOpen(false); // Also close globally just in case
    } else {
       useUIStore.getState().setSearchQuery(artistName);
       useUIStore.getState().setSearchOpen(true);
    }
  };

  return (
    <span className={`inline-flex flex-wrap items-center whitespace-pre-wrap ${className}`}>
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        const isSecondToLast = index === parts.length - 2;
        
        return (
          <React.Fragment key={index}>
            <span 
              onClick={(e) => handleArtistClick(e, index, part)}
              className="hover:underline cursor-pointer"
            >
              {part}
            </span>
            {!isLast && (
              <span className="pointer-events-none">
                {isSecondToLast ? ' & ' : ', '}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
}
