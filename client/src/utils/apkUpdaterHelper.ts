import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isCapacitor } from './StorageManager';

export interface ApkUpdaterProgressEvent {
  stage: 'downloading' | 'installing' | 'permission_required' | 'error';
  percent: number;
  downloaded: number;
  total: number;
  error?: string;
  filePath?: string;
}

export interface ApkUpdaterPluginType {
  canInstall(): Promise<{ canInstall: boolean }>;
  openInstallSettings(): Promise<{ success: boolean }>;
  installApk(options: { filePath: string }): Promise<{ success: boolean }>;
  downloadAndInstall(options: { url: string; fileName?: string }): Promise<{ stage: string; filePath?: string }>;
  addListener(
    eventName: 'update-download-progress',
    listenerFunc: (progress: ApkUpdaterProgressEvent) => void
  ): Promise<PluginListenerHandle>;
}

export const ApkUpdaterPlugin = isCapacitor()
  ? registerPlugin<ApkUpdaterPluginType>('ApkUpdater')
  : null;
