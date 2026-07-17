import React, { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { useLongPress } from '../../hooks/useLongPress';

interface LongPressWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onLongPress: (e: any) => void;
  onClick?: (e: any) => void;
  className?: string;
  delay?: number;
}

const LongPressWrapper = forwardRef<HTMLDivElement, LongPressWrapperProps>(({
  children,
  onLongPress,
  onClick = () => {},
  className = '',
  delay = 500,
  ...props
}, ref) => {
  const longPressProps = useLongPress(onLongPress, onClick, { delay });

  return (
    <div 
      ref={ref}
      className={className} 
      {...props}
      {...longPressProps}
    >
      {children}
    </div>
  );
});

export default LongPressWrapper;
