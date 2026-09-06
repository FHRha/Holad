
export const getHoladServerUrl = (): string => {
  const customUrl = localStorage.getItem('holadServerUrl');
  if (customUrl) {
    const cleanUrl = customUrl.replace(/\/$/, '');
    if (!cleanUrl.endsWith('/Holad')) {
      return `${cleanUrl}/Holad`;
    }
    return cleanUrl;
  }

  if (import.meta.env.VITE_SERVER_URL) {
    const cleanUrl = import.meta.env.VITE_SERVER_URL.replace(/\/$/, '');
    if (!cleanUrl.endsWith('/Holad')) {
      return `${cleanUrl}/Holad`;
    }
    return cleanUrl;
  }
  
  const path = window.location.pathname;
  if (path.toLowerCase().includes('/holad')) {
      return path.substring(0, path.toLowerCase().indexOf('/holad') + 6);
  }
  
  return '/Holad';
};

export const getSocketUrl = (): string => {
  const customUrl = localStorage.getItem('holadServerUrl');
  if (customUrl) return customUrl.replace(/\/$/, '');
  return import.meta.env.VITE_SERVER_URL || window.location.origin;
};

export const getShareUrl = (): string => {
  const customUrl = localStorage.getItem('holadServerUrl');
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }
  return window.location.origin;
};
