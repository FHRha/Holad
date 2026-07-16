import React from 'react';
import type { ReactNode } from 'react';
import { useLongPress } from '../../hooks/useLongPress';

interface LongPressWrapperProps {
  children: ReactNode;
  onLongPress: (e: any) => void;
  onClick?: (e: any) => void;
  className?: string;
  delay?: number;
}

const LongPressWrapper: React.FC<LongPressWrapperProps> = ({
  children,
  onLongPress,
  onClick = () => {},
  className = '',
  delay = 500
}) => {
  const longPressProps = useLongPress(onLongPress, onClick, { delay });

  return (
    <div className={className} {...longPressProps}>
      {children}
    </div>
  );
};

export default LongPressWrapper;
