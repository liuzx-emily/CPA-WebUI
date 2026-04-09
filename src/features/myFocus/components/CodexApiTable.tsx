import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconExternalLink } from '@/components/ui/icons';
import { maskApiKey } from '@/utils/format';
import { hasDisableAllModelsRule, getStatsBySource } from '@/components/providers/utils';
import type { ProviderKeyConfig } from '@/types';
import type { KeyStats } from '@/utils/usage';
import styles from '@/pages/MyFocusPage.module.scss';

interface CodexApiTableProps {
  configs: ProviderKeyConfig[];
  keyStats: KeyStats;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onToggle: (index: number, enabled: boolean) => void;
}

function buildBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined;
  return baseUrl.replace(/\/v1\/?$/, '');
}

export function CodexApiTable({
  configs,
  keyStats,
  loading,
  disableControls,
  isSwitching,
  onToggle,
}: CodexApiTableProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;

  const handleOpenUrl = useCallback((baseUrl: string) => {
    const url = buildBaseUrl(baseUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const sortedConfigs = useMemo(() => {
    return configs
      .map((config, originalIndex) => ({
        config,
        disabled: hasDisableAllModelsRule(config.excludedModels),
        originalIndex,
      }))
      .sort((a, b) => (a.disabled === b.disabled ? 0 : a.disabled ? 1 : -1));
  }, [configs]);

  if (loading && configs.length === 0) {
    return <div className="hint">{t('common.loading')}</div>;
  }

  if (!configs.length) {
    return (
      <EmptyState title="暂无 Codex API 配置" description="请在 AI 提供商页面添加 Codex API 配置" />
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.compactTable}>
        <thead>
          <tr>
            <th className={styles.colIndex}>#</th>
            <th className={styles.colApiKey}>密钥</th>
            <th className={styles.colUrl}>地址</th>
            <th className={styles.colStatus}>状态</th>
            <th className={styles.colStats}>统计</th>
          </tr>
        </thead>
        <tbody>
          {sortedConfigs.map((item, sortedIndex) => {
            const stats = getStatsBySource(item.config.apiKey, keyStats, item.config.prefix);

            return (
              <tr
                key={item.config.apiKey}
                className={item.disabled ? styles.rowDisabled : styles.rowEnabled}
              >
                <td className={styles.colIndex}>{sortedIndex + 1}</td>
                <td className={styles.colApiKey} title={maskApiKey(item.config.apiKey)}>
                  {maskApiKey(item.config.apiKey)}
                </td>
                <td className={styles.colUrl} title={item.config.baseUrl || ''}>
                  {item.config.baseUrl ? (
                    <span className={styles.urlCell}>
                      <button
                        type="button"
                        className={styles.urlLink}
                        onClick={() => handleOpenUrl(item.config.baseUrl!)}
                        title={buildBaseUrl(item.config.baseUrl)}
                      >
                        <IconExternalLink size={12} />
                      </button>
                      {item.config.baseUrl}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className={styles.colStatus}>
                  <ToggleSwitch
                    label=""
                    checked={!item.disabled}
                    disabled={actionsDisabled}
                    onChange={(value) => void onToggle(item.originalIndex, value)}
                  />
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
