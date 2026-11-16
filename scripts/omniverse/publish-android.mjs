/**
 * OmniVerse の Android 版を配信する
 *
 * Usage:
 *   node scripts/omniverse/publish-android.mjs --notes "軽微な修正"
 *   node scripts/omniverse/publish-android.mjs --version 1.14.1 --notes "..."
 *   node scripts/omniverse/publish-android.mjs --notes "..." --dry-run
 *   node scripts/omniverse/publish-android.mjs --notes "..." --no-push
 *   node scripts/omniverse/publish-android.mjs --beta --notes "テスト版"
 *
 * 何をするかは scripts/lib/publish-android.mjs を参照。
 */

import { publishAndroid } from '../lib/publish-android.mjs';

await publishAndroid({
  name: 'OmniVerse',
  repo: 'kuronekorou39/mobile-omniverse',
  prefix: 'omniverse',
  apkName: (version) => `OmniVerse-v${version}.apk`,
  projectId: 'omniverse',
});
