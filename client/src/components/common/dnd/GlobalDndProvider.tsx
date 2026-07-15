import React, { useState, useEffect } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
  pointerWithin,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, CollisionDetection } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { usePlayerStore } from '../../../store/playerStore';
import type { Track } from '../../../types';
import TrackDragOverlay from './TrackDragOverlay';

export function GlobalDndProvider({ children }: { children: React.ReactNode }) {
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [grabOffset, setGrabOffset] = useState<number>(0.5); // 0 to 1
  const { queue, reorderQueue, removeFromQueue } = usePlayerStore();

  useEffect(() => {
    const handlePointer = (e: PointerEvent) => {
      (window as any).lastMouseX = e.clientX;
    };
    window.addEventListener('pointerdown', handlePointer, { capture: true });
    window.addEventListener('pointermove', handlePointer, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointer, { capture: true });
      window.removeEventListener('pointermove', handlePointer, { capture: true });
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Requires a 5px movement to start drag, avoiding accidental clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const track = queue.find((_, idx) => `${queue[idx].id}-${idx}` === active.id) || active.data.current?.track;
    if (track) {
      setActiveTrack(track);
      
      // Calculate where the user grabbed the item horizontally
      const rect = active.rect.current.initial;
      if (rect) {
        // We need the mouse position. dnd-kit doesn't pass the exact mouse pos in dragStart easily,
        // but we can estimate or we can capture it in a global listener.
        // Actually, we can just use the global window.lastMouseX that we can set.
        const mouseX = (window as any).lastMouseX || rect.left + rect.width / 2;
        const relativeX = mouseX - rect.left;
        const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
        setGrabOffset(percentage);
      } else {
        setGrabOffset(0.5);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTrack(null);

    const oldIndex = queue.findIndex((track, idx) => `${track.id}-${idx}` === active.id);
    if (oldIndex === -1) return;

    if (!over) {
      // Dropped outside -> remove from queue
      removeFromQueue(oldIndex);
    } else if (active.id !== over.id) {
      const newIndex = queue.findIndex((track, idx) => `${track.id}-${idx}` === over.id);
      if (newIndex !== -1) {
        reorderQueue(oldIndex, newIndex);
      }
    }
  };

  const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  // Custom collision detection: only return collisions if the pointer is actually inside an element.
  // This prevents `closestCenter` from locking onto the list even when dragged far away.
  const customCollisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return closestCenter(args);
    }
    return [];
  };

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={dropAnimationConfig}>
        {activeTrack ? <TrackDragOverlay track={activeTrack} grabOffset={grabOffset} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
