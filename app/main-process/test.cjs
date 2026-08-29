const electron = require('electron');
console.log('Typeof electron:', typeof electron);
console.log('Typeof electron.app:', typeof electron.app);
console.log('Keys:', Object.keys(electron).slice(0, 20));

if (electron.app) {
  electron.app.whenReady().then(() => {
    console.log('App ready!');
    electron.app.quit();
  });
} else {
  console.log('app is undefined - trying direct require');
  // Try direct require of app
  const app = require('@electron/remote');
  console.log('remote app:', typeof app);
}
