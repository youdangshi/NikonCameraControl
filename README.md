# Nikon Camera Control

面向 **Nikon Z30 手机端** 的相机控制与修图应用。当前主交付物是 **Android APK**，重点支持 **PTP/IP over Wi-Fi 无线遥控**、STA 局域网、USB Type-C/OTG 有线备选，并内置本地照片修图与人像姿势库。

> 当前公开版本包含真实可运行的 `app/`（Capacitor Android + React UI + 原生 TCP/USB 插件）。`packages/`、`demo/` 和根目录的 monorepo 配置是早期蓝图，暂未纳入公开仓库。开发期可用 `server.cjs` 在本地浏览器预览，但产品方向以手机 App 为主。

## 功能

- 连接 Nikon 相机
  - 主路径：PTP/IP over Wi-Fi（相机热点 `192.168.1.1:15740`）
  - STA：相机与手机同网，输入相机 IP
  - 备选：USB Type-C / OTG（Android 原生 Bulk 通道）
  - 演示模式：无真机也能跑通连接、取景、拍摄、传图与修图
- 遥控拍摄
- 参数读取/设置：ISO、快门、光圈、曝光补偿、白平衡
- 手机实时取景器：动态画面、参数叠加、点击对焦
- 自动对焦
- 相册/照片下载
- 本地画布修图器
  - 曝光/对比/高光/阴影/色温/色调/饱和/清晰/锐化/暗角/颗粒/褪色
  - 风格预设：人像、风光、夜景、星空、桥梁、美食、胶片、日系、黑白、电影、街拍
  - 人像精修：磨皮、美白、红润、肤色、瑕疵、牙齿、唇色等步骤
  - 按题材整理的修图指南与一键应用
- 人像姿势悬浮窗
  - 站姿、坐姿、靠墙、回头、走路、蹲姿、比耶、侧身、半身、全身、头部、三分
  - 只显示人物框线，可拖动、缩放、调节透明度与颜色
- DeepSeek / OpenAI 兼容 AI 修图建议

## 项目结构

```text
nikon-camera-control/
├── app/                    # 真实可运行实现
│   ├── src/                # React / Capacitor 前端
│   │   ├── api.js          # App API：演示相机 + 原生直连 + 后端中转
│   │   ├── ptpip.js        # PTP/IP 与 USB PTP 协议核心
│   │   ├── demoCamera.js   # 无真机演示相机
│   │   ├── editor/         # 画布修图引擎与风格/教程数据
│   │   ├── components/     # 共享 UI 组件
│   │   └── screens/        # 连接/取景/参数/相册/设置
│   ├── server.cjs          # 开发预览后端（HTTP + WebSocket + 静态）
│   ├── main-process/       # Electron 主进程
│   ├── android/            # Capacitor Android 工程
│   │   └── .../TcpSocketPlugin.java   # 原生 TCP
│   │   └── .../UsbPtpPlugin.java      # 原生 USB Host / OTG
│   ├── package.json
│   └── capacitor.config.ts
├── docs/                   # 公开文档（含开源上传清单）
├── LICENSE
└── README.md
```

## 快速开始

### 下载测试 APK

当前 Release：https://github.com/youdangshi/NikonCameraControl/releases/tag/v1.0.0  
直接下载：https://github.com/youdangshi/NikonCameraControl/releases/download/v1.0.0/NikonCameraControl-1.0.0-debug.apk

### 开发预览（可选）

```bash
cd app
npm install
node server.cjs
```

浏览器打开 `http://localhost:19570`，可在「演示模式」中体验完整流程。

### Android APK

```bash
cd app
npm install
npx vite build
npx cap sync android
cd android
./gradlew assembleDebug
```

产物在 `app/android/app/build/outputs/apk/debug/app-debug.apk`；同时归档到 `app/release/NikonCameraControl-1.0.0-debug.apk`。

> 需要 JDK 21、Android SDK 36；`local.properties` 与 `.npmrc` 是本机文件，不在仓库内。

## 真机连接

1. 相机无线模式设为「允许计算机控制」；USB 模式设为 MTP/PTP。
2. 手机/电脑连接相机热点（如 `Nikon_Z30_XXX`）。
3. App 中连接 `192.168.1.1:15740`。
4. 连接失败时打开「握手诊断」，把日志发到 Issue，我们会根据真机响应校准 PTP/IP。

无真机时可在「我的相机 → 演示模式」直接体验。

## PTP/IP 状态

PTP/IP 握手与 Nikon 厂商命令正在用真机逐步验证。当前实现基于通用协议约定，并通过逐包诊断日志便于查错；手机端 USB OTG 已接入原生 Host 插件，真实相机行为仍需真机校准。

## 安全说明

- 仓库不包含 API Key。DeepSeek Key 仅保存在运行设备的 `localStorage`。
- 请勿把个人网络配置、SDK 路径、密钥或安装包提交到仓库。

## License

MIT，详见 [LICENSE](LICENSE)。
