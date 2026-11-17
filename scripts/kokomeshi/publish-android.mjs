/**
 * ココメシ の Android 版を配信する
 *
 * Usage:
 *   node scripts/kokomeshi/publish-android.mjs --notes "軽微な修正"
 *   node scripts/kokomeshi/publish-android.mjs --version 0.13.1 --notes "..."
 *   node scripts/kokomeshi/publish-android.mjs --notes "..." --dry-run
 *   node scripts/kokomeshi/publish-android.mjs --notes "..." --no-push
 *   node scripts/kokomeshi/publish-android.mjs --beta --notes "テスト版"
 *
 * 何をするかは scripts/lib/publish-android.mjs を参照。
 * 作品ページ(koko-meshi)の DL ボタンも、配信のたびに新しい APK へ向け直す。
 */

import { publishAndroid } from '../lib/publish-android.mjs';

await publishAndroid({
  name: 'ココメシ',
  repo: 'kuronekorou39/koko-meshi',
  prefix: 'kokomeshi',
  apkName: (version) => `kokomeshi-v${version}.apk`,
  projectId: 'koko-meshi',
});
