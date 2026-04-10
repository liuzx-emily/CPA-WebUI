import { execSync } from "node:child_process";
import { createInterface } from "node:readline";

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...options }).trim();
  } catch (e) {
    if (options.allowFail) return null;
    console.error(`\n[X] 命令执行失败: ${cmd}`);
    console.error(e.stderr?.trim() || e.message);
    process.exit(1);
  }
}

function runLive(cmd) {
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "inherit" });
  } catch (e) {
    console.error(`\n[X] 命令执行失败: ${cmd}`);
    process.exit(1);
  }
}

function question(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getLatestTag() {
  const tags = run("git tag --list \"v*\" --sort=-v:refname");
  if (!tags) return null;
  return tags.split("\n")[0].trim();
}

function parseVersion(tag) {
  const match = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    console.error(`[X] 无法解析版本号: ${tag}`);
    process.exit(1);
  }
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

function bumpVersion(version, type) {
  const v = { ...version };
  if (type === "patch") {
    v.patch++;
  } else if (type === "minor") {
    v.minor++;
    v.patch = 0;
  } else if (type === "major") {
    v.major++;
    v.minor = 0;
    v.patch = 0;
  }
  return v;
}

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

async function main() {
  console.log("=== CPA-WebUI 发版工具 ===\n");

  const currentBranch = run("git rev-parse --abbrev-ref HEAD");
  if (currentBranch !== "dev") {
    console.error(`[X] 当前分支是 "${currentBranch}"，请在 dev 分支上运行此脚本`);
    process.exit(1);
  }

  const status = run("git status --porcelain");
  if (status) {
    console.error("[X] 工作区有未提交的更改，请先提交或暂存");
    console.error(status);
    process.exit(1);
  }

  console.log("[*] 拉取远程最新信息...");
  run("git fetch origin");

  const localDev = run("git rev-parse dev");
  const remoteDev = run("git rev-parse origin/dev", { allowFail: true });
  if (remoteDev && localDev !== remoteDev) {
    console.error("[X] 本地 dev 分支未推送到远程，请先 git push origin dev");
    process.exit(1);
  }

  const latestTag = getLatestTag();
  let currentVersion;
  if (latestTag) {
    currentVersion = parseVersion(latestTag);
    console.log(`[*] 当前最新版本: ${latestTag}\n`);
  } else {
    currentVersion = { major: 0, minor: 0, patch: 0 };
    console.log("[*] 未找到任何版本标签\n");
  }

  const currentStr = formatVersion(currentVersion);
  const patchVersion = bumpVersion(currentVersion, "patch");
  const minorVersion = bumpVersion(currentVersion, "minor");
  const majorVersion = bumpVersion(currentVersion, "major");

  console.log("选择版本变更类型:");
  console.log(`  1) patch  (${currentStr} -> ${formatVersion(patchVersion)})  修复 bug、小调整`);
  console.log(`  2) minor  (${currentStr} -> ${formatVersion(minorVersion)})  新功能、非破坏性变更`);
  console.log(`  3) major  (${currentStr} -> ${formatVersion(majorVersion)})  破坏性变更`);
  console.log();

  const answer = await question("请输入选项 (1/2/3): ");
  let bumpType;
  if (answer === "1") bumpType = "patch";
  else if (answer === "2") bumpType = "minor";
  else if (answer === "3") bumpType = "major";
  else {
    console.error("[X] 无效选项");
    process.exit(1);
  }

  const newVersion = bumpVersion(currentVersion, bumpType);
  const newTag = `v${formatVersion(newVersion)}`;

  console.log(`\n[*] 新版本: ${newTag}`);
  const confirm = await question("确认发版? (y/N): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("已取消");
    process.exit(0);
  }

  console.log("\n--- 开始发版 ---\n");

  try {
    console.log("[1/6] 切换到 main 分支...");
    runLive("git checkout main");

    console.log("\n[2/6] 合并 dev 到 main...");
    runLive("git merge dev");

    console.log("\n[3/6] 推送 main 到远程...");
    runLive("git push origin main");

    console.log(`\n[4/6] 创建标签 ${newTag}...`);
    runLive(`git tag ${newTag}`);

    console.log(`\n[5/6] 推送标签 ${newTag}...`);
    runLive(`git push origin ${newTag}`);

    console.log("\n[OK] 发版完成！");
    console.log(`     GitHub Actions 将自动构建并创建 Release: ${newTag}`);
  } finally {
    console.log("\n[6/6] 切回 dev 分支...");
    runLive("git checkout dev");
  }
}

main();
