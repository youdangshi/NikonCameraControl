# 妮妮

Nikon Z30 相机控制 Android App（测试版）。

## 能做什么

- 手机控制尼康相机拍照
- 三种连接方式：相机 WiFi 热点、STA 局域网、USB Type-C
- 手机看实时画面，调 ISO、快门、光圈、曝光补偿、白平衡
- 把相机照片传到手机
- 照片直接修图：调色、风格预设、人像精修
- 拍人像时有姿势框线
- 没有相机也能用“实验模式”测试功能

## 下载和安装

1. 下载 APK：
   https://github.com/youdangshi/NikonCameraControl/releases/tag/v1.0.1
2. 把 APK 传到手机。
3. 安装时如果提示未知来源，允许安装。
4. 打开“妮妮”。

## 没有相机怎么试

打开 App 的“我的相机”，点“实验模式”，再点“启动实验”。

里面可以试：实时取景、拍照、相机照片、传图、修图、姿势框线。

## 真机连接

### 方式一：相机 WiFi 热点

1. 相机开机，无线模式设为“允许计算机控制”。
2. 手机连接相机热点，比如 `Nikon_Z30_XXX`。
3. App 里点“我的相机 → WiFi 热点 → 连接相机”。

连不上时，点“PTP/IP 握手诊断”，把日志发出来，方便校准协议。

### 方式二：STA 局域网

1. 相机和手机连同一个 WiFi。
2. 在相机菜单里查看相机 IP。
3. App 里选“STA 局域网”，填相机 IP，连接。

### 方式三：USB Type-C

1. 手机用 OTG 线连相机 Type-C。
2. 相机 USB 模式设为 MTP/PTP。
3. App 里选“USB Type-C”，连接。

## 怎么自己打包 APK

需要 JDK 21 和 Android SDK。

```bash
cd app
npm install
npx vite build
npx cap sync android
cd android
./gradlew assembleDebug
```

APK 输出位置：

```text
app/android/app/build/outputs/apk/debug/app-debug.apk
```

## 注意事项

- 当前是测试版，先不要用于正式拍摄。
- PTP/IP 命令需要用真机验证校准。
- 没有相机时，用“实验模式”测试。
- 不要把密钥、APK、本机路径传到仓库。

## License

MIT，见 [LICENSE](LICENSE)。
