# 妮妮 v1.4.6

本次更新把桌面端排查相机实时取景时确认的 Nikon 会话经验统一迁移到手机端，适用于 USB Type-C、相机 WiFi 热点和 STA PC 控制链路。

## 实时取景稳定性

- Nikon 连接后会按 `GetDeviceInfo -> ChangeApplicationMode(1) -> DeviceReady` 的顺序准备控制会话。
- `StartLiveView (0x9201)` 遇到 `0x2019 Device Busy` 时会短暂等待并重试，不再立即判定失败。
- 取景启动后轮询 `DeviceReady (0x90C8)`，确认取景传感器已经就绪后再持续取帧。
- `GetLiveViewImage (0x9203)` 遇到相机忙状态时会自动重试，减少偶发空帧。
- 停止取景使用独立超时，避免退出页面时长时间卡住。

## 兼容性

- `ChangeApplicationMode`、`DeviceReady` 和重试逻辑只在 Nikon 品牌下启用。
- STA“智能设备传输”模式不会发送应用模式切换，避免影响照片传输模式。
- Canon、Sony、Fujifilm 的已有能力边界保持不变。

## 构建信息

- Android：`versionCode 21`，`versionName 1.4.6`
- 应用名：妮妮
- 包名：`com.nikon.camera.control`
- APK：`Nini-1.4.6-debug.apk`
- 本地构建 SHA256：`238460D75BBC5D41438A7822E43D7661E0A59E51232BAA3AC9255CA501D8E482`
- GitHub Release 附件 SHA256：`242CBC3F37225730DE0E2F9FAE2A2E9B065B60AA205152129BDE75ACEDE410C6`

## 验证

- `npm run test:all` 通过。
- PTP/IP 与 USB 假相机测试覆盖新增的 `0x9435`、`0x90C8` 控制序列。
- Android APK 使用 JDK 21 构建成功，并通过 APK Signature Scheme v2 校验。
