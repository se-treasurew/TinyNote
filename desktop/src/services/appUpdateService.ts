import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { windowService } from './windowService';

export const TINYNOTE_GITHUB_URL = 'https://github.com/se-treasurew/TinyNote';

export interface AboutInfo {
  productName: string;
  displayName: string;
  version: string;
  githubUrl: string;
}

export interface AppUpdateMetadata {
  version: string;
  currentVersion: string;
  body: string;
  date: string | null;
}

export interface AppUpdateProgress {
  phase: 'started' | 'progress' | 'finished';
  downloaded: number;
  total: number | null;
  percent: number | null;
}

let pendingUpdate: Update | null = null;

export const appUpdateService = {
  async getAboutInfo(): Promise<AboutInfo> {
    const version = await getVersion();
    return {
      productName: 'TinyNote',
      displayName: '小笺',
      version,
      githubUrl: TINYNOTE_GITHUB_URL,
    };
  },

  async openGitHub(): Promise<void> {
    await openUrl(TINYNOTE_GITHUB_URL);
  },

  async checkForUpdate(): Promise<AppUpdateMetadata | null> {
    pendingUpdate = await check();
    return pendingUpdate ? toUpdateMetadata(pendingUpdate) : null;
  },

  async installUpdate(
    update: AppUpdateMetadata,
    onProgress: (progress: AppUpdateProgress) => void,
  ): Promise<void> {
    if (!pendingUpdate || pendingUpdate.version !== update.version) {
      throw new Error('没有可安装的更新，请先检查更新');
    }

    let downloaded = 0;
    let total: number | null = null;
    await pendingUpdate.downloadAndInstall((event) => {
      const nextProgress = reduceDownloadEvent(event, downloaded, total);
      downloaded = nextProgress.downloaded;
      total = nextProgress.total;
      onProgress(nextProgress);
    });
    pendingUpdate = null;
    await windowService.prepareForUpdateRelaunch().catch(() => undefined);
    await relaunch();
  },
};

function toUpdateMetadata(update: Update): AppUpdateMetadata {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body ?? '',
    date: update.date ?? null,
  };
}

function reduceDownloadEvent(
  event: DownloadEvent,
  downloaded: number,
  total: number | null,
): AppUpdateProgress {
  if (event.event === 'Started') {
    const nextTotal = event.data.contentLength ?? null;
    return {
      phase: 'started',
      downloaded: 0,
      total: nextTotal,
      percent: nextTotal ? 0 : null,
    };
  }

  if (event.event === 'Progress') {
    const nextDownloaded = downloaded + event.data.chunkLength;
    return {
      phase: 'progress',
      downloaded: nextDownloaded,
      total,
      percent: total ? Math.min(100, Math.round((nextDownloaded / total) * 100)) : null,
    };
  }

  return {
    phase: 'finished',
    downloaded,
    total,
    percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
  };
}
