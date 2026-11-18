const { withAndroidManifest, withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withWyzenWakeWord(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest["uses-permission"] || (manifest["uses-permission"] = []);
    const addPermission = (name) => {
      if (!permissions.some((item) => item.$["android:name"] === name)) permissions.push({ $: { "android:name": name } });
    };
    addPermission("android.permission.RECORD_AUDIO");
    addPermission("android.permission.FOREGROUND_SERVICE");
    addPermission("android.permission.FOREGROUND_SERVICE_MICROPHONE");
    return config;
  });
  config = withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;
    if (!gradle.includes("https://jitpack.io")) {
      config.modResults.contents = gradle.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        (match) => match + "\n        maven { url 'https://jitpack.io' }"
      );
    }
    return config;
  });
  return config;
};
