# 妮妮 v1.8.0

本次更新增加手机相机功能，并修复不同测试版本之间无法覆盖安装的问题。

## 手机相机

- 新增独立“手机相机”页面。
- 使用 Capacitor 官方 Camera 插件调用 Android 系统相机。
- 支持前后摄像头方向选择。
- 拍摄后自动保存到系统相册。
- 拍摄完成后可直接进入修图器。
- 首页和本地照片页均增加手机拍照入口。
- 浏览器环境保留文件拍摄回退，Android 原生环境使用系统相机。

## 固定测试签名

- 项目新增固定的测试签名文件 `nini-test.keystore`。
- Android `debug` 和 `release` 构建统一使用该测试签名。
- 后续版本可以直接覆盖安装，不再需要先卸载旧版本。
- 从早期临时签名版本升级到 `1.8.0` 时仍需卸载一次；之后可持续升级。

## 验证

- `npm run test:all` 通过。
- Android 使用 `versionCode 26`、`versionName 1.8.0` 构建。
- 安装包使用项目固定测试签名。
- 签名证书：`CN=Nini Test, OU=Android, O=Nini, L=Beijing, ST=Beijing, C=CN`
- 签名证书 SHA-256：`db8102dda8aac7e9aa59190bc9d5e51ad7708b72e0b95f03620b27e6bb66aaa8`
- 本地 APK SHA256：`996357DBE7C884581FB0C2FB68C9771EB3F854D8B2042CAA8B511A38AC812FD6`
