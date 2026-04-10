# CPA-WebUI

本项目 fork 自 [CPA 默认 management 页面](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)，在保留原有功能的同时新增了自定义功能

## 自定义功能

- 新增 **我的关注** 页面：Codex 认证文件/API 配置的集中管理页面

## 使用方式

在 CPA 的 `config.yaml` 中配置：

```yaml
remote-management:
  panel-github-repository: 'https://github.com/liuzx-emily/CPA-WebUI'
```

CPA 会自动从仓库的 latest Release 下载 `management.html`。详见 [自定义页面部署文档](https://help.router-for.me/management/webui)。

## 开发

开发流程、分支策略和发布方式详见 [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)。
