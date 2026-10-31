import { useEffect, useState } from 'react';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { DesktopContextMenu, MobileContextMenuDrawer } from './context-menu';

export default function ContextMenu() {
  const { isOpen, item } = useContextMenuStore();
  const [isMobile, setIsMobile] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen || !item) return null;

  return isMobile ? <MobileContextMenuDrawer /> : <DesktopContextMenu />;
}
