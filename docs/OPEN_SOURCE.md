# GitHub 开源上传清单

本文件是 `nikon-camera-control/` 开源上传前的权威清单。原则是：

> **只上传源码与公开文档；本地依赖、构建产物、个人路径、密钥、参考 APK 严禁上传。**

## 1. 推荐公开仓库根目录

使用：

```text
C:\Users\李\Desktop\项目组\nikon-camera-control
```

作为 GitHub 仓库根目录。`README.md`、`LICENSE`、`docs/` 与本目录 `.gitignore` 已放入。

## 2. 上传白名单

| 路径 | 说明 |
|---|---|
| `README.md` | 项目介绍、使用与构建说明 |
| `LICENSE` | MIT 开源协议 |
| `.gitignore` | 防止误传的清单文件 |
| `docs/OPEN_SOURCE.md` | 本清单 |
| `app/package.json` | 前端/后端依赖与脚本 |
| `app/package-lock.json` | 锁定依赖版本（不含密钥） |
| `app/src/**` | React 前端源码 |
| `app/server.cjs` | Node 后端 |
| `app/main-process/**` | Electron 主进程 |
| `app/capacitor.config.ts` | Capacitor 配置 |
| `app/vite.config.js` / `postcss.config.js` / `tailwind.config.js` / `index.html` | 构建配置 |
| `app/android/gradlew` / `gradlew.bat` | Gradle Wrapper 脚本 |
| `app/android/gradle/wrapper/gradle-wrapper.jar` | Wrapper JAR（唯一允许的 JAR） |
| `app/android/gradle/wrapper/gradle-wrapper.properties` | Gradle 版本配置 |
| `app/android/build.gradle` / `settings.gradle` / `variables.gradle` / `gradle.properties` | Android 构建配置 |
| `app/android/app/build.gradle` / `capacitor.build.gradle` | App 构建配置 |
| `app/android/app/src/main/**` | Android 源码、清单、资源 |
| `app/android/capacitor.settings.gradle` | Capacitor Android 工程设置 |

## 3. 禁止上传黑名单

| 路径/模式 | 原因 |
|---|---|
| `node_modules/`、`**/node_modules/` | 第三方依赖，不进 Git |
| `dist/`、`**/dist/` | Vite/Electron 构建产物 |
| `**/build/`、`**/.gradle/` | Android Gradle 构建产物 |
| `*.apk`、`*.aab`、`*.exe`、`*.ipa`、`*.dmg` | 安装包/二进制产物（用 GitHub Releases 另发） |
| `app/android/local.properties` | 本机 SDK 路径 |
| `app/release/` | 本地 APK 交付目录 |
| `.env`、`.env.*`、`.npmrc`、`*.keystore`、`*.jks` | 本地配置、镜像配置与签名密钥 |
| `app/android/app/src/main/assets/public/` | `cap sync` 自动生成的 Web 资源 |
| `app/android/app/src/main/assets/capacitor.config.json`、`capacitor.plugins.json` | `cap sync` 自动生成 |
| `app/android/capacitor-cordova-android-plugins/` | 自动生成，`npx cap sync` 重建 |
| `packages/`、`demo/`、根 `package.json`、`tsconfig.base.json` | 早期蓝图/演示副本，公开 v1 不传 |
| `CLAUDE.md`、`CONTEXT.md`、`AGENTS.md` | 本地工作文档，含个人路径与进行中状态 |
| `.apk_ref/`、`*.apk.1`、`app-release.apk*` | 参考 APK 及其反解产物，**严禁上传** |
| `.claude/`、`.codex/`、`.agent-teams/`、`.dsh-*` | 本地工具配置 |

## 4. 敏感信息已核对

- 仓库源码**没有真实 API Key**；`apiKey` 仅是变量名，占位符为 `sk-xxxxxxxxxxxxxxxx`。
- DeepSeek Key 只保存在设备 `localStorage`，不要提交。
- `app/android/gradle.properties` 中已移除具体用户路径注释。
- `local.properties`、`.npmrc`、APK 均不会上传。

## 5. 参考 APK 的处理

附件 `C:/Users/李/Desktop/app-release.apk.1` 是第三方/CameraSyncPro 参考安装包，**不能**上传到本项目仓库。我们在功能设计上参考了它的 `GridOverlay` / `live_view_overlays` 架构思路，但实现代码是原创。不要复制其二进制、资源或受版权保护的素材。

## 6. 推送前检查命令

在仓库根目录执行：

```bash
git status
git check-ignore -v app/android/local.properties
git ls-files
```

`git status` 不应出现 `node_modules`、APK、`build`、`.apk_ref` 等路径。
