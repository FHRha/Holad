import React from 'react';

export interface ItemBtnProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  color?: string;
}

export function ItemBtn({ icon: Icon, label, onClick, color = 'text-foreground' }: ItemBtnProps) {
  return (
    <button 
      type="button"
      onClick={(e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        onClick(); 
      }}
      onMouseDown={(e) => { 
        if (e.button !== 0) return; // only left click
        e.preventDefault(); 
        e.stopPropagation(); 
      }}
      onMouseUp={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-foreground/10 transition-colors text-sm font-semibold ${color}`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

export interface MobileIconBtnProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  color?: string;
  activeColor?: string;
}

export function MobileIconBtn({
  icon: Icon,
  label,
  onClick,
  color = 'text-foreground',
  activeColor = ''
}: MobileIconBtnProps) {
  return (
    <button 
      type="button"
      onClick={(e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        onClick(); 
      }}
      className="flex flex-col items-center justify-center gap-1.5 p-2 active:bg-foreground/10 rounded-xl transition-colors"
    >
      <Icon size={22} className={activeColor || color} />
      <span className={`text-[10px] font-medium text-center leading-tight ${color} opacity-80`}>{label}</span>
    </button>
  );
}
