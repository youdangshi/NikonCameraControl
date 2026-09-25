# 妮妮 v1.5.0

本次更新升级手机端照片工作流，重点参考 Photoshop / Lightroom 的曲线和蒙版交互方式，而不是只增加滑块。

## 编辑历史

- 支持撤销、重做和键盘 `Ctrl/Cmd + Z`。
- 每次参数调整停顿后自动建立历史快照，最多保留 40 步。
- 撤销范围覆盖基础调色、人像、曲线、蒙版、色彩轮、LUT 和尼康云创参数。

## 专业曲线

- 曲线面板区分 `RGB / 红 / 绿 / 蓝` 四个通道。
- 每个通道保留黑场、阴影、中间调、高光、白场五个控制点。
- 使用 Fritsch-Carlson 单调三次插值，避免普通样条常见的过冲和相邻色调震荡。
- 提供当前通道复位、轻微 S 曲线、反 S 曲线和增强黑白场。
- 独立 RGB 通道曲线在像素处理阶段分别应用，不是只改界面。

## 画笔蒙版

- 保留径向渐变和线性渐变蒙版。
- 新增直接在照片上拖动画笔绘制蒙版。
- 支持画笔大小、羽化、不透明度、反向和清除笔画。
- 预览中显示笔触覆盖，渲染时生成真实蒙版后再应用局部曝光、对比度、饱和度和色温。

## USB 真机修复

- 使用 Nikon Z30、Redmi M2011K2C 和 USB Type-C 完成真机验证。
- USB 实时取景连续收到 `0x9203` JPEG 帧，测试约 `11 FPS`，直方图和快捷参数正常。
- 真机确认 Z30 的 USB PTP 接口不响应 `ChangeApplicationMode (0x9435)`，该命令只保留在 PTP/IP 链路。
- Android 原生 USB 层在 OUT 请求超时后会主动取消未完成请求，避免一次超时污染后续参数读取。

## 验证

- 新增曲线单调性和身份 LUT 单元测试。
- `npm run test:all` 覆盖协议、假相机、品牌适配和编辑器算法。
- Android 使用 `versionCode 23`、`versionName 1.5.0` 构建。
- USB 真机日志确认 `OpenSession`、`GetDeviceInfo`、`DeviceReady` 和持续 `GetLiveViewImage` 正常。
- 本地 APK SHA256：`8E4A0D7EBEA4CBB0139498FB101DE91C7A9FE1CE889F2FCEAC6FD6F6C085DE94`
- GitHub Release 附件 SHA256：`254440E8BCBD98774A346040AC191122DFC99236CA551266E3ABF2DE79126020`
