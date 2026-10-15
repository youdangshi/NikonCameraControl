# 妮妮 v1.12.3

本次更新加入相机照片下载到手机、点击移动对焦点、扩展取景流和预览尺寸选择。

## 相机照片下载

- 单张照片可点击“下载到手机”，通过 PTP `GetObject` 读取原始文件。
- 照片页支持“全部下载”，逐项显示进度和失败数量。
- JPEG 写入 Android 相册 `Pictures/Nini`；MOV/MP4 写入 `Movies/Nini`；其他原始文件写入 `Downloads/Nini`。
- 已下载项目显示绿色完成标记。
- 单文件超过 200 MB 时会明确提示，避免手机内存被大文件拖垮。

## 对焦与取景

- 点击实时画面会通过 Nikon `0x9205 ChangeAfArea` 移动对焦区域，并显示持久对焦框。
- 支持标准流 `0x9203` 和扩展流 `0x9428`；扩展流失败自动回退。
- 读取 Nikon `0xD1AC LiveViewImageSize`，显示并允许选择相机声明的 QVGA / VGA 预览尺寸。
- Z30 实测两种取景流均提供 `640×424`，这是相机 PTP 预览上限。

## 照片枚举修复

- 正确识别 Nikon 卡槽 ID `0x00010001 / 0x00020001`。
- 使用 `GetObjectHandles(StorageID, 0, 0xFFFFFFFF)` 递归读取存储卡。
- Z30 真机复测成功枚举 292 项照片和视频。

## 验证

- `npm run test:all` 通过。
- Vite 生产构建通过。
- Android Gradle 构建与 MediaStore 原生插件通过。
- 本地校验 APK SHA256：`2745DC0830C50EB1D9274201F511ED745BEFA3AE283895605C56D63B3EE32C24`。
