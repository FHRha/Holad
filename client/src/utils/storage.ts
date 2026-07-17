export function clearAppCache() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Delete only keys that belong to our app (Zustand persists and others)
    if (key && (key.startsWith('streamnavi-') || key.startsWith('holad-'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}
