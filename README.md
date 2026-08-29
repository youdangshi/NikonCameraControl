# Nikon Camera Control

跨平台 Nikon Z30 相机控制软件，重点支持 **PTP/IP over Wi-Fi 无线遥控**，USB 有线作为备选，并集成 DeepSeek AI 修图建议。

> 当前公开版本包含真实可运行的 `app/`（Electron 桌面 + Capacitor Android + React UI + Node 后端）。`packages/`、`demo/` 和根目录的 monorepo 配置是早期蓝图，暂未纳入公开仓库。

## 功能

- 连接 Nikon 相机
  - 主路径：PTP/IP over Wi-Fi（相机热点 `192.168.1.1:15740`）
  - 备选：USB 有线（Windows 需 Zadig 换 WinUSB 驱动）
- 遥控拍摄
- 参数读取/设置：ISO、快门、光圈、曝光补偿、白平衡
- 实时取景
- 自动对焦
- 相册/照片下载
- DeepSeek AI 修图建议
- 人像拍照姿势框线
  - 实时取景/拍照时显示构图框线
  - 半身、全身、头部特写、三分构图、对焦网格
  - 透明度、颜色可调，可开关，本地持久化

## 项目结构

```text
nikon-camera-control/
├── app/                    # 真实可运行实现
│   ├── src/                # React / Capacitor 前端
│   │   ├── api.js          # 双模式 API：后端中转 + 手机原生直连
│   │   ├── ptpip.js        # PTP/IP 协议核心 + 传输抽象
│   │   ├── components/     # 共享 UI 组件
│   │   └── screens/        # 连接/取景/参数/相册/设置
│   ├── server.cjs          # Node 后端（HTTP + WebSocket + 静态）
│   ├── main-process/       # Electron 主进程
│   ├── android/            # Capacitor Android 工程
│   ├── package.json
│   └── capacitor.config.ts
├── docs/                   # 公开文档（含开源上传清单）
├── LICENSE
└── README.md
```

## 快速开始

### Web / 桌面后端

```bash
cd app
npm install
node server.cjs
```

浏览器打开 `http://localhost:19570`。

### Android APK

```bash
cd app
npm install
npx vite build
npx cap sync android
cd android
./gradlew assembleDebug
```

产物在 `app/android/app/build/outputs/apk/debug/app-debug.apk`。

> 需要 JDK 21、Android SDK 36；`local.properties` 与 `.npmrc` 是本机文件，不在仓库内。

## 真机连接

1. 相机无线模式设为「允许计算机控制」。
2. 手机/电脑连接相机热点（如 `Nikon_Z30_XXX`）。
3. App 中连接 `192.168.1.1:15740`。
4. 连接失败时打开「握手诊断」，把日志发到 Issue，我们会根据真机响应校准 PTP/IP。

## PTP/IP 状态

PTP/IP 握手与 Nikon 厂商命令正在用真机逐步验证。当前实现基于通用协议约定，并通过逐包诊断日志便于查错。USB 备用路径已实现于 `server.cjs`。

## 安全说明

- 仓库不包含 API Key。DeepSeek Key 仅保存在运行设备的 `localStorage`。
- 请勿把个人网络配置、SDK 路径、密钥或安装包提交到仓库。

## License

MIT，详见 [LICENSE](LICENSE)。
