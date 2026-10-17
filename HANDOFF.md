# 交接说明：妮妮 Nini（Nikon 相机遥控 / 传图 / 修图）

> 给任何接手的智能体：本文是事实基线，先读完再动手。若本文与代码冲突，以代码为准，并顺手修正本文。

## 0. 一句话定位

妮妮是一个 Android 应用，用 USB 线、相机 WiFi 热点或局域网三种方式连接尼康相机，在手机上做实时取景、参数控制、对焦、拍摄、把相机照片下载到手机，并内置调色与人像修图。主线真机是 Nikon Z30 加 Redmi M2011K2C（Android 13）。

当前版本 `1.12.3`，已发布：https://github.com/youdangshi/NikonCameraControl/releases/tag/v1.12.3

## 1. 事实基线（2026-10-17）

| 项目 | 值 |
| --- | --- |
| 仓库目录 | 本机 `nikon-camera-control/`（独立 git 仓库，不是父目录） |
| 远端 | https://github.com/youdangshi/NikonCameraControl |
| 分支 | 本地 `master`，远端 `main`，推送用 `master:main` |
| 最新提交 | `944e6ff`（README 文档），发版提交 `5b89406` |
| 应用名 / 包名 | 妮妮 / `com.nikon.camera.control` |
| 版本 | `1.12.3`，versionCode `33` |
| Android 范围 | minSdk 24（Android 7.0），compile/target 36 |
| 已发布 APK | `Nini-1.12.3-debug.apk`，8,381,208 字节 |
| APK SHA256 | `2745DC0830C50EB1D9274201F511ED745BEFA3AE283895605C56D63B3EE32C24` |

版本号要四处同步，漏一处会出现“应用内提示的版本和安装包不一致”：

1. `app/package.json` 的 `version`
2. `app/package-lock.json` 的 `version`
3. `app/android/app/build.gradle` 的 `versionName` 与 `versionCode`
4. `app/src/appUpdater.js` 里浏览器模式回退的 `versionName` / `versionCode`

## 2. 环境与硬约束

- 开发机是 Windows，终端用 PowerShell。下文用 `<仓库根目录>` 表示本机 clone 位置，按实际路径替换。
- 本机 git 直连 github.com 会失败，必须走代理：
  `git -c http.version=HTTP/1.1 -c http.proxy=http://127.0.0.1:7897 push origin master:main`
- GitHub Token 曾被粘贴在对话里。不要把 Token 写进 remote URL、源码、文档或提交；需要鉴权时用本机已保存的凭据。
- 构建 APK 需要 JDK 21（CI 用 temurin 21）。本机可用 Android Studio 自带 JBR，或设置 `JAVA_HOME`。
- 真机调试需要 `adb`。当前机器的 PATH 与常见 SDK 路径下都找不到 `adb.exe`，接手前先装 platform-tools。
- 相机会话是独占的：手机连着相机时电脑不能用，反之亦然。USB 测手机就拔掉电脑那条线。
- 相机开 WiFi 热点模式后，手机连上它就没有外网，也会断掉无线 adb。调试时优先用 USB 数据线保持 adb。

## 3. 代码地图（真实结构，以 `app/` 为准）

```
nikon-camera-control/
├── app/                     # 真正在维护的应用
│   ├── src/                 # React 前端 + 传输与协议层
│   ├── android/             # Capacitor Android 工程与原生插件
│   ├── scripts/             # 协议与引擎自测（npm run test:all）
│   └── release/             # 本地构建出的历史 APK（不入库）
├── docs/                    # 各版本发布说明
├── .github/workflows/       # Android 构建与 GitHub Release 自动化
├── README.md                # 对外介绍与安装说明
└── HANDOFF.md               # 本文
```

关键文件与职责：

| 文件 | 职责 |
| --- | --- |
| `app/src/api.js` | 会话入口 `camera.connectCamera(mode, host, port)`，`mode` 取 `wifi` / `sta` / `usb`；PTP 命令、取景帧、拍摄、文件枚举、原始文件下载、保存到相册 |
| `app/src/ptpip.js` | PTP/IP 客户端（WiFi 与 STA 链路） |
| `app/src/nikonProperties.js` | 尼康属性码与枚举编码。**禁止把界面上的文字直接写给相机** |
| `app/src/ptpPropertyDesc.js`、`cameraControlCatalog.js` | 属性取值范围、档位、可写性判定 |
| `app/src/cameraAdapters.js`、`cameraBrands.js` | 多品牌适配层与品牌识别 |
| `app/src/nikonModels.js` | 机型能力表 |
| `app/android/.../UsbPtpPlugin.java` | Android USB Host + PTP 实现 |
| `app/android/.../TcpSocketPlugin.java` | 原生 TCP 套接字（WiFi / STA 用） |
| `app/android/.../CameraUiPlugin.java` | 全屏、横竖屏、常亮、`saveToGallery`（MediaStore 落盘） |
| `app/android/.../AppUpdaterPlugin.java` | 应用内检查更新、下载并安装 APK |
| `app/src/screens/LiveViewScreen.jsx` | 取景界面：参数面板、对焦框、直方图、构图辅助线、全屏切换 |
| `app/src/screens/CameraPhotosScreen.jsx` | 相机存储卡浏览、单张/批量下载到手机 |
| `app/src/screens/EditorScreen.jsx` + `app/src/editor/` | 修图引擎、预设、曲线、蒙版 |
| `app/src/ai.js` | 多供应商 AI 分析（OpenAI / DeepSeek / 硅基流动 等） |
| `app/scripts/*.mjs` | 协议、假相机、品牌适配、修图引擎、AI 解析的自测 |

## 4. 三条连接链路的口径

| 模式 | 手机侧操作 | 相机侧设置 | 备注 |
| --- | --- | --- | --- |
| USB | OTG / Type-C 直连，授予 USB 权限 | USB 模式设为 MTP 或 PTP | 已验证会话、参数、取景（真机约 30 FPS）、拍摄、枚举 |
| 相机热点 | 手机连相机的 WiFi | 开启“连接到智能设备” | 相机是 AP，手机侧拿不到外网 |
| STA 局域网 | 手机开热点，相机加入；或在同一路由器下 | 相机选“连接到电脑”模式 | 需要填相机 IP；分“PC 控制”和“智能设备传图”两种 profile，后者只传图不控制 |

已知现象：进入实时取景后相机可能从手机热点断开。这个在 `sta` 与热点模式都出现过，属于待解问题，不要把“能连上但取景断开”当成新 bug。

## 5. 已验证与未验证（不要对外夸大）

已验证（Nikon Z30 真机）：

- USB 会话建立、参数读写、实时取景、连续 JPEG 帧、遥控拍摄。
- 相机存储卡枚举（曾枚举 292 项，含 JPEG 与 MOV）。
- 相机 WiFi 热点的 PTP/IP 基础链路、照片读取、取景链路。

未验证或仅识别：

- `1.12.3` 的下载功能没有做过真机安装验证（构建时无可用 adb 设备）。
- STA 模式下的取景稳定性。
- Canon、Sony、Fujifilm 只有识别与通用 PTP 浏览，没有真机控制验证。

## 6. 已知坑

1. `CLAUDE.md` 里的 `packages/` 架构是早期方案，已经过时。实际代码在 `app/`。
2. `CONTEXT.md` 被 `.gitignore` 排除，是本地记忆文件。别人 clone 仓库看不到它，所以关键事实要写进 `HANDOFF.md` 或 README。
3. 仓库根目录堆着大量 `nini-*.png` 与 `nini-*.xml` 调试产物，未清理。不要擅自删除，先确认归属。
4. GitHub Actions 只在提交信息包含 `[release]` 时构建并发布；普通提交会被 skip。
5. “全部下载”下载的是当前筛选结果。选“全部”时视频也会被尝试，单文件超过 200 MB 会拒绝并计入失败数。
6. Android 7 到 9 需要 `WRITE_EXTERNAL_STORAGE` 才能写入相册；Android 10 以上走 MediaStore。
7. 快门、光圈在某些拍摄模式下是只读的。写入失败要读 PTP 响应码并保留相机原值，不要直接改界面。
8. 取景参数以相机回读为准。曾出现手机显示 `1/4000` 而相机是 `1/40` 的问题，属于编码换算错误，改参数前先看 `nikonProperties.js` 的编码表。

## 7. 接手第一步（照着跑）

```powershell
cd <仓库根目录>\app
npm ci
npm run test:all
npx vite build --configLoader runner

cd android
.\gradlew assembleDebug
```

产物：`app/android/app/build/outputs/apk/debug/app-debug.apk`

装到真机：

```powershell
adb devices -l
adb install -r app\android\app\build\outputs\apk\debug\app-debug.apk
```

注意 `adb install -r` 对同签名的升级有效。历史上出现过“必须先卸载旧版才能装”的情况，若复现，用 `adb install -r -d` 或先卸载再装，并记录原因。

## 8. 改完怎么发版

1. 同步四处版本号（见第 1 节），新增 `docs/RELEASE_NOTES_vX.Y.Z.md`，更新 README 的版本与下载链接。
2. `npm run test:all` 与 `npx vite build` 必须通过，再构建 APK。
3. 提交信息必须包含 `[release]`，例如：
   `git commit -m "[release] add xxx for Nini 1.12.4"`
4. 推送：
   `git -c http.version=HTTP/1.1 -c http.proxy=http://127.0.0.1:7897 push origin master:main`
5. 等 Actions 完成：https://github.com/youdangshi/NikonCameraControl/actions
6. 确认 `vX.Y.Z` Release 存在，附件为 `Nini-X.Y.Z-debug.apk`。

## 9. 当前待办优先级

1. 真机验证 `1.12.3`：单张下载、批量下载、JPEG 落 `Pictures/Nini`、MOV 落 `Movies/Nini`。
2. 下载体验：只下照片的开关、断点续传、大视频分块传输。
3. STA 与相机热点下的取景稳定性（连接一段时间后断开）。
4. 相机热点模式下参数显示不全、手机端部分参数不可调。
5. 多相机连接档案：保存多台相机与历史 IP，连接时可选。
6. 更多机型与品牌的真机适配。

## 10. 给智能体的开场提示词

把下面这段直接发给接手的智能体：

> 你要接手“妮妮 Nini”Android 相机控制项目，先完整阅读仓库根目录的 `HANDOFF.md`，再读 `README.md` 与 `app/src/api.js`。动手前先跑 `cd app; npm run test:all` 确认基线是绿的。真实主线是 Nikon Z30 + Android 手机，没有硬件时不要假装验证过真机行为。修改版本号要同步四处，发版提交信息必须含 `[release]`，推送走代理并推到 `origin master:main`。不要提交 Token、APK、个人照片或本机路径。
