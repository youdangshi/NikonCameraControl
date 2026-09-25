# 妮妮 v1.7.0

本次更新完成多品牌协议适配层，重点是把品牌能力、操作码和风险边界从业务代码中分离。

## 品牌适配器

- 新增独立 `cameraAdapters` 层，每种品牌拥有自己的操作码表、能力声明和验证状态。
- Nikon 适配器保持完整功能，覆盖通用 PTP、Nikon 厂商属性、实时取景、对焦和快门。
- Canon EOS 操作码按 libgphoto2 公开相机记录整理，包括取景、对焦和远程释放映射。
- 未完成真机验证前，Canon 厂商扩展默认关闭，只允许通用 PTP 检测和照片浏览。
- Sony、Fujifilm 保持 discovery-only，只开放标准 PTP，避免误发不兼容私有命令。
- 厂商操作码调用统一经过 `assertAdapterCommand` 风险检查。

## 能力边界

- 业务层不再直接判断品牌名称后发送 Nikon 操作码。
- 实时取景、取景帧、自动对焦和快门均从当前适配器取得命令。
- 未实现或未验证的厂商命令会被明确阻止并给出适配器说明。
- 设置页新增品牌协议适配状态列表。

## 验证

- 新增品牌适配器单元测试，验证 Nikon 操作码、Canon 映射和未验证命令拦截。
- `npm run test:all` 覆盖协议、假相机、品牌识别、图像引擎、Nikon 机型和适配器。
- Android 使用 `versionCode 25`、`versionName 1.7.0` 构建。
- 本地 APK SHA256：`6941D294407B1EA3EB4C722C5E51366F7D4BF80F6CAF446E2D2A4DD0EA98FDB2`
- GitHub Release 附件 SHA256：`B940194544259347182F2AD3B15C1DC2A30FA5C279A691BC87C10391BEA8C8A5`
