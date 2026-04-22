# CPA-WebUI 开发指南

## 项目定位

本项目是为 [CLI Proxy API（CPA）](https://github.com/router-for-me/CLIProxyAPI) 开发的自定义 management 页面，上游项目是 [CPA 的默认 management 页面](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)。

## 自定义页面部署

CPA 支持[自定义 management 页面](https://help.router-for.me/management/webui)，在 `config.yaml` 中配置：

```yaml
remote-management:
  panel-github-repository: 'https://github.com/liuzx-emily/CPA-WebUI'
```

CPA 服务端会定期检查最新 Release，下载名为 `management.html` 的 asset。

## 开发流程

核心目标：**将代码变更可靠地交付为 GitHub Release 中的 `management.html`**。整个流程围绕这个目标展开：

1. 在 `dev` 上开发，确保代码经过验证后才进入 `main`
2. 在 `dev` 上同步上游，将冲突解决与稳定发布隔离
3. 合并到 `main` 后打标签，触发 GitHub Actions 构建 `management.html` 并创建 Release
4. CPA 检测到新 Release 后自动拉取，自定义页面生效

### 分支策略

采用两分支策略：

| 分支   | 用途     | 规则                          |
| ------ | -------- | ----------------------------- |
| `main` | 稳定版本 | 只接受从 dev 合并，永远可发布 |
| `dev`  | 日常开发 | 功能完成并测试后合并到 main   |

日常流程：

```bash
# 开发（在 dev 上）
git checkout dev
git commit -m "feat: 新功能"
git push origin dev

# 同步上游（在 dev 上）
git fetch --no-tags upstream #--no-tags 避免把 upstream 的发布标签同步到本地，影响本仓库后续发版时的版本号判断
git merge upstream/main    # 冲突优先保留上游变更，再重新添加自定义代码
git push origin dev

# 发布（在 dev 上使用自动化脚本）
npm run release
# 脚本会先校验本地 dev 与 origin/dev 是否完全一致；若只是本地 ahead 未 push，会先询问是否自动推送。通过检查后，再引导选择版本变更类型（patch/minor/major），并自动完成切换分支、merge、push、打标签等操作。操作完成后（不论成功或失败），自动切回 dev 分支
```

#### 合并策略

合并代码统一使用 `merge`，不用 `rebase`：

- `merge` 保留完整历史和冲突解决记录，便于追溯上游合并，出问题时一步回退（`git revert -m 1 HEAD`）
- `rebase` 改写历史，已推送后需 force push，且逐个 commit 解决冲突出错难以定位
- 适用 rebase 的场景：整理本地未推送的 commit、`git pull --rebase` 避免无意义 merge commit

### 发布

**构建产物**：`npm run build` 通过 `vite-plugin-singlefile` 生成单文件 `dist/index.html`，所有资源内联。Release 流程中重命名为 `management.html`。

**发布触发**：推送 `v*` 标签触发 `.github/workflows/release.yml`。

**发布方式**：在 `dev` 分支上运行 `npm run release`，脚本会自动执行以下步骤：

1. 前置检查（当前分支、工作区状态、`dev` 与 `origin/dev` 一致性；若只是本地 ahead 未 push，可确认后自动推送）
2. 选择版本变更类型（patch / minor / major）
3. 确认后自动：切换到 main → 合并 dev → 推送 main → 创建标签 → 推送标签 → 切回 dev

脚本源码见 `scripts/release.mjs`。

**Fork 项目注意事项**：

- Fork 仓库的 GitHub Actions 默认不启用，需先到 Actions 面板手动启用
