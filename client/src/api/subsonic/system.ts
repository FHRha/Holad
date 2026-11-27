import { buildUrl, fetchWithRetry } from '../subsonic-core';

export interface SubsonicScanStatus {
  scanning: boolean;
  count?: number;
  folderCount?: number;
  lastScan?: string;
}

function parseScanStatus(data: any): SubsonicScanStatus {
  const raw = data?.['subsonic-response']?.scanStatus;
  return {
    scanning: Boolean(raw?.scanning),
    count: typeof raw?.count === 'number' ? raw.count : undefined,
    folderCount: typeof raw?.folderCount === 'number' ? raw.folderCount : undefined,
    lastScan: typeof raw?.lastScan === 'string' ? raw.lastScan : undefined,
  };
}

export const startScan = async (): Promise<SubsonicScanStatus> => {
  const url = buildUrl('startScan.view');
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return parseScanStatus(data);
};

export const getScanStatus = async (): Promise<SubsonicScanStatus> => {
  const url = buildUrl('getScanStatus.view');
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return parseScanStatus(data);
};
