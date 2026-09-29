import { Capacitor, registerPlugin } from '@capacitor/core';

const AppUpdater = registerPlugin('AppUpdater');

export const appUpdater = {
  isNative: () => Capacitor.isNativePlatform(),

  async getAppInfo() {
    if (!Capacitor.isNativePlatform()) return { versionName: '1.12.0', versionCode: 30 };
    return AppUpdater.getAppInfo();
  },

  async checkForUpdate(owner = 'youdangshi', repo = 'NikonCameraControl') {
    if (!Capacitor.isNativePlatform()) return { updateAvailable: false, web: true };
    return AppUpdater.checkForUpdate({ owner, repo });
  },

  async downloadAndInstall(update) {
    if (!Capacitor.isNativePlatform()) throw new Error('当前平台不支持自动安装 APK');
    return AppUpdater.downloadAndInstall({
      url: update.assetUrl,
      fileName: update.assetName || 'Nini-update.apk',
      digest: update.digest || '',
    });
  },
};
