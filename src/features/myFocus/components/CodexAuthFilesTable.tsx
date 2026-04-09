import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw } from '@/components/ui/icons';
import { isRuntimeOnlyAuthFile } from '@/features/authFiles/constants';
import { resolveAuthFileStats } from '@/features/authFiles/constants';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import type { KeyStats } from '@/utils/usage';
import styles from '@/pages/MyFocusPage.module.scss';

interface CodexAuthFilesTableProps {
  files: AuthFileItem[];
  keyStats: KeyStats;
  loading: boolean;
  disableControls: boolean;
  statusUpdating: Record<string, boolean>;
  codexQuota: Record<string, CodexQuotaState>;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onRefreshQuota: (file: AuthFileItem) => void;
}

const CODEX_NAME_PATTERN = /^codex-(.+)@hotmail\.com-free\.json$/;

function formatAuthFileName(name: string): string {
  const match = CODEX_NAME_PATTERN.exec(name);
  return match ? match[1] : name;
}

function formatResetCountdown(resetAtSeconds: number | null | undefined): string {
  if (resetAtSeconds == null || resetAtSeconds <= 0) return '-';
  const nowSec = Math.floor(Date.now() / 1000);
  let diffSec = resetAtSeconds - nowSec;
  if (diffSec <= 0) return '-';
  const days = Math.floor(diffSec / 86400);
  diffSec %= 86400;
  const hours = Math.ceil(diffSec / 3600);
  if (hours === 0 && days === 0) return '<1小时';
  if (days > 0 && hours >= 24) return `${days + 1}天`;
  if (days > 0) return `${days}天${hours}小时`;
  return `${hours}小时`;
}

export function CodexAuthFilesTable({
  files,
  keyStats,
  loading,
  disableControls,
  statusUpdating,
  codexQuota,
  onToggleStatus,
  onRefreshQuota,
}: CodexAuthFilesTableProps) {
  const { t } = useTranslation();

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      return 0;
    });
  }, [files]);

  if (loading && files.length === 0) {
    return <div className="hint">{t('common.loading')}</div>;
  }

  if (!files.length) {
    return (
      <EmptyState
        title="暂无 Codex 认证文件"
        description="请在认证文件页面上传 Codex 认证文件"
      />
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th className={styles.colIndex}>#</th>
            <th className={styles.colName}>名称</th>
            <th className={styles.colQuota}>额度</th>
            <th className={styles.colResetTime}>重置时间</th>
            <th className={styles.colStatus}>状态</th>
            <th className={styles.colStats}>统计</th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map((file, index) => {
            const stats = resolveAuthFileStats(file, keyStats);
            const isRuntimeOnly = isRuntimeOnlyAuthFile(file);

            const quotaState = codexQuota[file.name];
            const weeklyWindow = quotaState?.windows?.find((w) => w.id === 'weekly');
            const quotaLoading = quotaState?.status === 'loading';

            let quotaLabel: string;
            let quotaClassName = '';
            if (!quotaState || quotaState.status === 'idle') {
              quotaLabel = '--';
            } else if (quotaState.status === 'loading') {
              quotaLabel = '...';
            } else if (quotaState.status === 'error') {
              quotaLabel = '!';
              quotaClassName = styles.statFailure;
            } else if (weeklyWindow?.usedPercent != null) {
              const remaining = Math.max(0, Math.min(100, 100 - weeklyWindow.usedPercent));
              quotaLabel = `${Math.round(remaining)}%`;
              if (remaining >= 70) quotaClassName = styles.statSuccess;
              else if (remaining >= 30) quotaClassName = styles.statWarning;
              else quotaClassName = styles.statFailure;
            } else {
              quotaLabel = '--';
            }

            const resetTimeLabel = formatResetCountdown(weeklyWindow?.resetAtSeconds);

            return (
              <tr
                key={file.name}
                className={`${file.disabled ? styles.rowDisabled : styles.rowEnabled} ${isRuntimeOnly ? styles.rowVirtual : ''}`}
              >
                <td className={styles.colIndex}>{index + 1}</td>
                <td className={styles.colName} title={file.name}>
                  {formatAuthFileName(file.name)}
                </td>
                <td className={styles.colQuota}>
                  <span className={styles.quotaCell}>
                    <span className={quotaClassName}>{quotaLabel}</span>
                    <button
                      type="button"
                      className={styles.urlLink}
                      onClick={() => onRefreshQuota(file)}
                      disabled={quotaLoading || disableControls}
                      title="刷新额度"
                    >
                      <IconRefreshCw size={11} className={quotaLoading ? styles.spinning : undefined} />
                    </button>
                  </span>
                </td>
                <td className={styles.colResetTime}>{resetTimeLabel}</td>
                <td className={styles.colStatus}>
                  {isRuntimeOnly ? (
                    <span className={`${styles.statusBadge} ${styles.statusVirtual}`}>
                      虚拟
                    </span>
                  ) : (
                    <ToggleSwitch
                      ariaLabel="切换启用状态"
                      checked={!file.disabled}
                      disabled={disableControls || statusUpdating[file.name] === true}
                      onChange={(value) => onToggleStatus(file, value)}
                    />
                  )}
                </td>
                <td className={styles.colStats}>
                  <span className={styles.statSuccess}>✓{stats.success}</span>{' '}
                  <span className={styles.statFailure}>✗{stats.failure}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
