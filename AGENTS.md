# CPA-WebUI 项目 AI 开发指令

核心目标：**减少与上游的合并冲突**。

## 减少冲突的核心策略

### 1. 自定义代码隔离在 `src/features/`

所有自定义功能必须在 `src/features/{feature-name}/` 下实现，每个功能模块自包含（组件、hooks、工具函数、类型定义都放在同一目录下）。

**不要**在 `src/components/`、`src/services/`、`src/stores/`、`src/hooks/`、`src/utils/` 等上游已有的目录中创建新文件。

参照现有模块：`src/features/authFiles/`、`src/features/myFocus/`。

### 2. 最小化对上游文件的修改

- **添加而非修改**：在上游文件中追加代码，不要修改已有的代码行
- **集中添加**：import 语句添加在 import 块末尾，路由/导航项添加在列表末尾，减少与上游编辑同一行的概率
- **记录修改点**：在下方"上游文件修改清单"中登记所有修改过的上游文件和位置

### 3. 不要修改上游的 i18n 文件

**新增功能的界面文本直接在代码中使用中文字符串，不需要走 i18n 机制。**

不要为新增功能添加 i18n 键值（不要修改 `zh-CN.json`、`en.json`、`ru.json` 等语言文件）。仅当修改上游已有的多语言功能时，才通过 i18n 机制处理多语言。

### 4. 不要修改 `package.json` 中的上游依赖版本

添加新依赖时使用 `npm install`，但不要修改上游已有依赖的版本号。

## 上游文件修改清单

同步上游时根据此表定位冲突，冲突解决原则：**优先保留上游变更，在此基础上重新添加自定义代码**。

| 文件                                   | 修改内容                                       | 添加位置          |
| -------------------------------------- | ---------------------------------------------- | ----------------- |
| `src/router/MainRoutes.tsx`            | 添加 `/my-focus` 路由                          | 路由列表末尾      |
| `src/components/layout/MainLayout.tsx` | 添加"我的关注"导航项，标签改为硬编码中文       | navItems 数组末尾 |
| `src/components/ui/icons.tsx`          | 添加 IconSidebarMyFocus 图标                   | 图标定义区域      |
| `src/types/quota.ts`                   | 添加 `resetAtSeconds` 字段到 CodexQuotaWindow  | 接口定义区域      |
| `src/components/quota/quotaConfigs.ts` | 添加 `resetAtSeconds` 计算逻辑                 | addWindow 函数内  |

> 新增修改时请更新此表。

## 提交前检查

```bash
npm run type-check
npm run lint
npm run build
```
