import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDndContext } from '@dnd-kit/core';

interface SortableItemProps {
  id: string;
  children: (props: {
    setNodeRef: (node: HTMLElement | null) => void;
    attributes: any;
    listeners: any;
    style: React.CSSProperties;
    isDragging: boolean;
  }) => React.ReactNode;
}

export function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  
  const { over } = useDndContext();
  const hidePhantom = isDragging && !over;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? (hidePhantom ? 0 : 0.4) : 1, // Visually fade or hide
    height: hidePhantom ? 0 : undefined,
    margin: hidePhantom ? 0 : (isDragging ? '8px 0' : undefined), // add gap for the phantom
    padding: hidePhantom ? 0 : undefined,
    overflow: hidePhantom ? 'hidden' : undefined,
    border: isDragging && !hidePhantom ? '2px dashed rgba(255, 255, 255, 0.3)' : undefined, // visual drop cue
    borderRadius: isDragging && !hidePhantom ? '8px' : undefined,
    zIndex: isDragging ? 0 : 1,
    position: 'relative',
  };

  return <>{children({ setNodeRef, attributes, listeners, style, isDragging })}</>;
}
