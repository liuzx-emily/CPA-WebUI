import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import iconCodex from '@/assets/icons/codex.svg';
import { CodexApiTable } from '@/features/myFocus/components/CodexApiTable';
import { CodexAuthFilesTable } from '@/features/myFocus/components/CodexAuthFilesTable';
import { CODEX_CONFIG } from '@/components/quota';
import {
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import { isRuntimeOnlyAuthFile } from '@/features/authFiles/constants';
import { useProviderStats } from '@/components/providers';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { providersApi, authFilesApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem, ProviderKeyConfig } from '@/types';
import styles from './MyFocusPage.module.scss';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object' || err === null) return '';
  if (!('message' in err)) return '';
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

function getQuotaErrorInfo(err: unknown): { message: string; status?: number } {
  const message = err instanceof Error ? err.message : getErrorMessage(err) || '未知错误';
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: number }).status
      : undefined;
  return { message, status };
}

export function MyFocusPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);

  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>(
    () => config?.codexApiKeys || []
  );
  const [codexAuthFiles, setCodexAuthFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [configSwitchingKey, setConfigSwitchingKey] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});

  const disableControls = connectionStatus !== 'connected';
  const isSwitching = Boolean(configSwitchingKey);

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const { keyStats, loadKeyStats, refreshKeyStats } = useProviderStats({
    enabled: isCurrentLayer,
  });

  const hasMounted = useRef(false);
  const quotaLoadingRef = useRef(new Set<string>());

  const loadCodexConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConfig();
      const configs = data?.codexApiKeys || [];
      setCodexConfigs(configs);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [fetchConfig]);

  const loadCodexAuthFiles = useCallback(async () => {
    setAuthLoading(true);
    try {
      const response = await authFilesApi.list();
      const codexFiles = response.files.filter(
        (file) => (file.type || '').toLowerCase() === 'codex'
      );
      setCodexAuthFiles(codexFiles);
    } catch {
      // silently fail
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([loadCodexConfigs(), loadCodexAuthFiles(), refreshKeyStats()]);
  }, [loadCodexConfigs, loadCodexAuthFiles, refreshKeyStats]);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    void loadCodexConfigs();
    void loadCodexAuthFiles();
  }, [loadCodexConfigs, loadCodexAuthFiles]);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadKeyStats().catch(() => {});
  }, [isCurrentLayer, loadKeyStats]);

  useEffect(() => {
    if (config?.codexApiKeys) setCodexConfigs(config.codexApiKeys);
  }, [config?.codexApiKeys]);

  useHeaderRefresh(refreshAll, isCurrentLayer);

  const saveCodexConfigs = useCallback(
    async (nextList: ProviderKeyConfig[], previousList: ProviderKeyConfig[]) => {
      setCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');

      try {
        await providersApi.saveCodexConfigs(nextList);
        return true;
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setCodexConfigs(previousList);
        updateConfigValue('codex-api-key', previousList);
        clearCache('codex-api-key');
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
        return false;
      }
    },
    [showNotification, t, updateConfigValue, clearCache]
  );

  const handleToggleAllCodexConfigs = useCallback(
    async (enabled: boolean) => {
      const previousList = codexConfigs;
      const nextList = codexConfigs.map((item) => ({
        ...item,
        excludedModels: enabled
          ? withoutDisableAllModelsRule(item.excludedModels)
          : withDisableAllModelsRule(item.excludedModels),
      }));

      const ok = await saveCodexConfigs(nextList, previousList);
      if (ok) {
        showNotification(
          enabled ? '已全部启用 Codex API 配置' : '已全部禁用 Codex API 配置',
          'success'
        );
      }
    },
    [codexConfigs, saveCodexConfigs, showNotification]
  );

  const handleToggleAllAuthFiles = useCallback(
    async (enabled: boolean) => {
      const targets = codexAuthFiles.filter(
        (f) => !isRuntimeOnlyAuthFile(f) && f.disabled === enabled
      );
      if (targets.length === 0) {
        showNotification(enabled ? '所有认证文件已处于启用状态' : '所有认证文件已处于禁用状态', 'info');
        return;
      }

      setStatusUpdating((prev) => {
        const next = { ...prev };
        targets.forEach((f) => { next[f.name] = true; });
        return next;
      });

      const results = await Promise.allSettled(
        targets.map(async (f) => {
          await authFilesApi.setStatus(f.name, !enabled);
          return f.name;
        })
      );

      const succeededNames: string[] = [];
      const updatingReset: Record<string, boolean> = {};
      results.forEach((result, i) => {
        const name = targets[i].name;
        if (result.status === 'fulfilled') {
          succeededNames.push(name);
        }
        updatingReset[name] = true;
      });

      if (succeededNames.length > 0) {
        setCodexAuthFiles((prev) =>
          prev.map((f) =>
            succeededNames.includes(f.name) ? { ...f, disabled: !enabled } : f
          )
        );
      }

      setStatusUpdating((prev) => {
        const next = { ...prev };
        Object.keys(updatingReset).forEach((name) => { delete next[name]; });
        return next;
      });

      const failedCount = targets.length - succeededNames.length;
      if (failedCount === 0) {
        showNotification(
          enabled ? '已全部启用 Codex 认证文件' : '已全部禁用 Codex 认证文件',
          'success'
        );
      } else {
        showNotification(
          `${succeededNames.length} 个成功，${failedCount} 个失败`,
          'warning'
        );
      }
    },
    [codexAuthFiles, showNotification]
  );

  const handleToggleCodexConfig = useCallback(
    async (index: number, enabled: boolean) => {
      const current = codexConfigs[index];
      if (!current) return;

      setConfigSwitchingKey(`codex:${current.apiKey}`);

      const previousList = codexConfigs;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
      const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));

      const ok = await saveCodexConfigs(nextList, previousList);
      if (ok) {
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      }
      setConfigSwitchingKey(null);
    },
    [codexConfigs, saveCodexConfigs, showNotification, t]
  );

  const handleToggleAuthFileStatus = useCallback(
    async (file: AuthFileItem, enabled: boolean) => {
      setStatusUpdating((prev) => ({ ...prev, [file.name]: true }));
      try {
        await authFilesApi.setStatus(file.name, !enabled);
        setCodexAuthFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, disabled: !enabled } : f))
        );
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      }
    },
    [showNotification, t]
  );

  const handleRefreshQuota = useCallback(
    async (file: AuthFileItem) => {
      if (quotaLoadingRef.current.has(file.name)) return;
      quotaLoadingRef.current.add(file.name);

      setCodexQuota((prev) => ({
        ...prev,
        [file.name]: CODEX_CONFIG.buildLoadingState(),
      }));

      try {
        const data = await CODEX_CONFIG.fetchQuota(file, t);
        setCodexQuota((prev) => ({
          ...prev,
          [file.name]: CODEX_CONFIG.buildSuccessState(data),
        }));
      } catch (err: unknown) {
        const { message, status } = getQuotaErrorInfo(err);
        setCodexQuota((prev) => ({
          ...prev,
          [file.name]: CODEX_CONFIG.buildErrorState(message, status),
        }));
      } finally {
        quotaLoadingRef.current.delete(file.name);
      }
    },
    [setCodexQuota, t]
  );

  const handleRefreshAllQuota = useCallback(async () => {
    const targets = codexAuthFiles.filter((f) => !quotaLoadingRef.current.has(f.name));
    if (targets.length === 0) return;

    targets.forEach((f) => quotaLoadingRef.current.add(f.name));

    setCodexQuota((prev) => {
      const next = { ...prev };
      targets.forEach((f) => {
        next[f.name] = CODEX_CONFIG.buildLoadingState();
      });
      return next;
    });

    const results = await Promise.allSettled(
      targets.map(async (file) => {
        try {
          const data = await CODEX_CONFIG.fetchQuota(file, t);
          return { name: file.name, data };
        } catch (err: unknown) {
          const { message, status } = getQuotaErrorInfo(err);
          return { name: file.name, error: message, errorStatus: status };
        } finally {
          quotaLoadingRef.current.delete(file.name);
        }
      })
    );

    setCodexQuota((prev) => {
      const next = { ...prev };
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const val = result.value;
          if ('data' in val && val.data) {
            next[val.name] = CODEX_CONFIG.buildSuccessState(val.data);
          } else {
            next[val.name] = CODEX_CONFIG.buildErrorState(val.error, val.errorStatus);
          }
        }
      });
      return next;
    });
  }, [codexAuthFiles, setCodexQuota, t]);

  const handleRefreshEnabledQuota = useCallback(async () => {
    const targets = codexAuthFiles.filter(
      (f) => !f.disabled && !isRuntimeOnlyAuthFile(f) && !quotaLoadingRef.current.has(f.name)
    );
    if (targets.length === 0) return;

    targets.forEach((f) => quotaLoadingRef.current.add(f.name));

    setCodexQuota((prev) => {
      const next = { ...prev };
      targets.forEach((f) => {
        next[f.name] = CODEX_CONFIG.buildLoadingState();
      });
      return next;
    });

    const results = await Promise.allSettled(
      targets.map(async (file) => {
        try {
          const data = await CODEX_CONFIG.fetchQuota(file, t);
          return { name: file.name, data };
        } catch (err: unknown) {
          const { message, status } = getQuotaErrorInfo(err);
          return { name: file.name, error: message, errorStatus: status };
        } finally {
          quotaLoadingRef.current.delete(file.name);
        }
      })
    );

    setCodexQuota((prev) => {
      const next = { ...prev };
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const val = result.value;
          if ('data' in val && val.data) {
            next[val.name] = CODEX_CONFIG.buildSuccessState(val.data);
          } else {
            next[val.name] = CODEX_CONFIG.buildErrorState(val.error, val.errorStatus);
          }
        }
      });
      return next;
    });
  }, [codexAuthFiles, setCodexQuota, t]);

  return (
    <div className={styles.page}>
      <div className={styles.columnsLayout}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>
              <img src={iconCodex} alt="" className={styles.sectionTitleIcon} />
              Codex 认证文件
            </span>
            <div className={styles.sectionActions}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleToggleAllAuthFiles(true)}
                disabled={disableControls || authLoading}
                className={styles.lightButton}
              >
                全部启用
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleToggleAllAuthFiles(false)}
                disabled={disableControls || authLoading}
                className={styles.lightButton}
              >
                全部禁用
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRefreshEnabledQuota}
                disabled={disableControls || authLoading}
                className={styles.enabledRefreshButton}
                title="刷新已启用项的额度"
              >
                刷新启用
              </Button>
              <Button
              size="sm"
              onClick={handleRefreshAllQuota}
              disabled={disableControls || authLoading}
              className={`${styles.lightButton} ${styles.refreshAllButton}`}
              title="刷新所有项的额度"
            >
              刷新全部
            </Button>
            </div>
          </div>
          <CodexAuthFilesTable
            files={codexAuthFiles}
            keyStats={keyStats}
            loading={authLoading}
            disableControls={disableControls}
            statusUpdating={statusUpdating}
            codexQuota={codexQuota}
            onToggleStatus={handleToggleAuthFileStatus}
            onRefreshQuota={handleRefreshQuota}
          />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>
              <img src={iconCodex} alt="" className={styles.sectionTitleIcon} />
              Codex API 配置
            </span>
            <div className={styles.sectionActions}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleToggleAllCodexConfigs(true)}
                disabled={disableControls || loading || isSwitching}
                className={styles.lightButton}
              >
                全部启用
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleToggleAllCodexConfigs(false)}
                disabled={disableControls || loading || isSwitching}
                className={styles.lightButton}
              >
                全部禁用
              </Button>
            </div>
          </div>
          <CodexApiTable
            configs={codexConfigs}
            keyStats={keyStats}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onToggle={handleToggleCodexConfig}
          />
        </div>
      </div>
    </div>
  );
}
