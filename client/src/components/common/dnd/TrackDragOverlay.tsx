import { useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import type { Track } from '../../../types';
import TrackImage from '../TrackImage';
import { formatArtistName } from '../../../utils/formatters';
import { useDndContext } from '@dnd-kit/core';

interface TrackDragOverlayProps {
  track: Track;
  grabOffset?: number; // 0 to 1, where 0 is left edge, 1 is right edge
}

export default function TrackDragOverlay({ track, grabOffset = 0.5 }: TrackDragOverlayProps) {
  
  // Read current drag state to see if we are hovering over a valid drop zone
  const { over } = useDndContext();
  const isHoveringValidZone = !!over;

  // Determine gravity baseline: 
  // If grabbed left (0), right side falls -> positive rotation.
  // If grabbed right (1), left side falls -> negative rotation.
  const gravityRotation = isHoveringValidZone ? 0 : (grabOffset - 0.5) * -80; // Up to 40 deg each way

  const targetRotation = useMotionValue(gravityRotation);
  const smoothRotation = useSpring(targetRotation, { stiffness: 100, damping: 10, mass: 1 });

  useEffect(() => {
    targetRotation.set(gravityRotation);
  }, [gravityRotation, targetRotation]);

  useEffect(() => {
    let lastX = 0;
    let lastTime = performance.now();
    let isInitialized = false;
    
    const handleMove = (clientX: number) => {
      if (!isInitialized) {
        lastX = clientX;
        lastTime = performance.now();
        isInitialized = true;
        return;
      }

      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        const dx = clientX - lastX;
        const velocity = (dx / dt) * 15; 
        
        // Target = gravity + inertia swing
        // Moving right (pos velocity) -> swing left (neg rotation)
        const swing = velocity * -0.5; 
        const clampedSwing = Math.max(-40, Math.min(40, swing));
        
        targetRotation.set(gravityRotation + clampedSwing);
      }
      lastX = clientX;
      lastTime = now;
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [gravityRotation, targetRotation]);

  return (
    <motion.div 
      style={{ rotate: smoothRotation, transformOrigin: `${grabOffset * 100}% top` }}
      className="flex items-center px-2 py-2 bg-[#1e1e1e]/80 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-lg w-[300px] pointer-events-none scale-105"
    >
      <div className="w-12 h-12 flex-shrink-0 mr-4 rounded-lg overflow-hidden shadow-md">
        <TrackImage src={track.coverArt} className="w-full h-full object-cover" alt="" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="truncate text-base font-bold text-white drop-shadow-md">{track.title}</p>
        <p className="truncate text-sm text-white/70">{formatArtistName(track.artist)}</p>
      </div>
    </motion.div>
  );
}
