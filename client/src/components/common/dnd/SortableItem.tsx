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
    opacity: isDragging ? 0 : 1, // Completely hide phantom to create a clean gap
    height: hidePhantom ? 0 : undefined,
    overflow: hidePhantom ? 'hidden' : undefined,
    position: 'relative',
    zIndex: isDragging ? 0 : 1,
  };

  return <>{children({ setNodeRef, attributes, listeners, style, isDragging })}</>;
}
