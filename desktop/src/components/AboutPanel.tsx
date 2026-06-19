import { Download, ExternalLink, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  appUpdateService,
  type AboutInfo,
  type AppUpdateMetadata,
  type AppUpdateProgress,
} from '../services/appUpdateService';
import { useUiStore } from '../stores/uiStore';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'installing' | 'error';

export function AboutPanel() {
  const closePanel = useUiStore((state) => state.closePanel);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdateMetadata | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);

  useEffect(() => {
    let active = true;
    appUpdateService
      .getAboutInfo()
      .then((info) => {
        if (active) setAboutInfo(info);
      })
      .catch((error) => {
        if (active) {
          setAboutInfo({
            productName: 'TinyNote',
            displayName: '小笺',
            version: '',
            githubUrl: 'https://github.com/se-treasurew/TinyNote',
          });
          setStatus('error');
          setMessage(`更新失败：${formatError(error)}`);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function openGitHub() {
    try {
      await appUpdateService.openGitHub();
    } catch (error) {
      setStatus('error');
      setMessage(`更新失败：${formatError(error)}`);
    }
  }

  async function checkForUpdate() {
    setStatus('checking');
    setMessage('正在检查更新');
    setProgress(null);
    try {
      const update = await appUpdateService.checkForUpdate();
      setPendingUpdate(update);
      if (update) {
        setStatus('available');
        setMessage(`发现新版本 v${update.version}`);
      } else {
        setStatus('latest');
        setMessage('当前已是最新版本');
      }
    } catch (error) {
      setStatus('error');
      setMessage(`更新失败：${formatError(error)}`);
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) return;
    setStatus('installing');
    setMessage('正在安装更新');
    setProgress(null);
    try {
      await appUpdateService.installUpdate(pendingUpdate, (nextProgress) => {
        setProgress(nextProgress);
        if (nextProgress.phase === 'progress') {
          setMessage(nextProgress.percent === null ? '正在下载更新' : `正在下载更新 ${nextProgress.percent}%`);
        }
        if (nextProgress.phase === 'finished') {
          setMessage('正在安装更新');
        }
      });
    } catch (error) {
      setStatus('error');
      setMessage(`更新失败：${formatError(error)}`);
    }
  }

  const versionText = aboutInfo?.version ? `当前版本 v${aboutInfo.version}` : '当前版本读取中';
  const isChecking = status === 'checking';
  const isInstalling = status === 'installing';

  return (
    <aside className="panel about-panel" role="complementary" aria-label="关于 TinyNote">
      <header className="panel-header">
        <strong>关于 TinyNote</strong>
        <button type="button" aria-label="关闭" onClick={closePanel}>
          <X size={16} />
        </button>
      </header>
      <section className="about-hero">
        <div>
          <strong>{aboutInfo?.displayName ?? '小笺'}</strong>
          <span>{aboutInfo?.productName ?? 'TinyNote'}</span>
        </div>
        <p>轻量的桌面任务便签，用来安放今天、每日和多日事项。</p>
      </section>
      <div className="about-meta">
        <span>{versionText}</span>
        <span>更新源 GitHub Releases</span>
      </div>
      <div className="about-actions">
        <button type="button" className="ghost" onClick={() => void openGitHub()}>
          <ExternalLink size={15} />
          <span>打开 GitHub</span>
        </button>
        <button type="button" disabled={isChecking || isInstalling} onClick={() => void checkForUpdate()}>
          <RefreshCw size={15} />
          <span>{isChecking ? '检查中' : '检查更新'}</span>
        </button>
        <button
          type="button"
          disabled={!pendingUpdate || isChecking || isInstalling}
          onClick={() => void installUpdate()}
        >
          <Download size={15} />
          <span>{isInstalling ? '更新中' : '更新'}</span>
        </button>
      </div>
      {message && <p className={`about-status ${status === 'error' ? 'error' : ''}`}>{message}</p>}
      {pendingUpdate?.body.trim() && (
        <section className="about-release-notes" aria-label={`v${pendingUpdate.version} 更新说明`}>
          <strong>更新说明</strong>
          <p>{pendingUpdate.body.trim()}</p>
        </section>
      )}
      {progress && progress.total !== null && (
        <div className="about-progress" aria-label="更新下载进度">
          <span style={{ width: `${progress.percent ?? 0}%` }} />
        </div>
      )}
    </aside>
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
