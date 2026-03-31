import type { Project } from '../../../shared/src/types';

export const mockProjects: Project[] = [
  {
    id: 'u2b-loop',
    title: 'U2B Loop',
    subtitle: 'YouTube動画の区間リピートツール',
    description:
      '# U2B Loop\n\nYouTube動画の特定区間をリピート再生できるWebアプリケーション。\n\n## 特徴\n\n- URLを貼るだけで即再生\n- 開始・終了時間をドラッグで直感的に設定\n- 再生速度の変更対応\n- ブックマーク機能で設定を保存',
    howToUse:
      '## 使い方\n\n1. YouTube動画のURLを入力\n2. タイムラインバーで開始・終了時間を設定\n3. ループ再生ボタンを押す\n4. 必要に応じて再生速度を調整',
    category: 'web',
    tags: ['React', 'TypeScript', 'YouTube API', 'Tailwind CSS'],
    platform: ['Web'],
    icon: '',
    screenshots: [],
    links: { web: '#', github: '#' },
    status: 'active',
    publishedAt: '2025-01-15',
    updatedAt: '2025-12-01',
  },
  {
    id: 'koko-meshi',
    title: 'Koko-Meshi',
    subtitle: '近くの飯屋をサッと探す',
    description:
      '# Koko-Meshi\n\n現在地周辺の飲食店を素早く検索できるモバイルアプリ。\n\n## 特徴\n\n- GPS連動でワンタップ検索\n- ジャンル・距離・予算でフィルタ\n- お気に入り登録・履歴管理\n- オフラインマップ対応',
    howToUse:
      '## 使い方\n\n1. アプリを開く（位置情報を許可）\n2. 近くのお店がマップ上に表示される\n3. ジャンルや条件でフィルタリング\n4. お店をタップして詳細を確認',
    category: 'mobile',
    tags: ['React Native', 'Firebase', 'Google Maps API', 'Expo'],
    platform: ['iOS', 'Android'],
    icon: '',
    screenshots: [],
    links: {},
    status: 'active',
    publishedAt: '2025-03-01',
    updatedAt: '2026-01-15',
  },
  {
    id: 'domain-traffic-inspector',
    title: 'Domain Traffic Inspector',
    subtitle: 'ドメインのトラフィックを可視化',
    description:
      '# Domain Traffic Inspector\n\nブラウザのネットワーク通信をドメインごとに分類・可視化するChrome拡張機能。\n\n## 特徴\n\n- リアルタイムでトラフィックを監視\n- ドメインごとの通信量を円グラフで表示\n- サードパーティトラッカーの検出\n- エクスポート機能（CSV/JSON）',
    howToUse:
      '## 使い方\n\n1. Chrome拡張機能をインストール\n2. 任意のWebサイトを閲覧\n3. 拡張機能アイコンをクリックしてダッシュボードを表示\n4. ドメインごとの通信量を確認',
    category: 'extension',
    tags: ['Chrome Extension', 'TypeScript', 'Chart.js', 'Webpack'],
    platform: ['Chrome'],
    icon: '',
    screenshots: [],
    links: { github: '#' },
    status: 'active',
    publishedAt: '2025-06-01',
    updatedAt: '2025-11-20',
  },
  {
    id: 'cryptid-assistant',
    title: 'Cryptid Assistant',
    subtitle: 'AI搭載のアシスタントツール',
    description:
      '# Cryptid Assistant\n\nAI APIを活用した多機能アシスタントWebアプリ。\n\n## 特徴\n\n- 自然言語での対話インターフェース\n- コンテキスト保持による連続会話\n- カスタムプロンプトのテンプレート管理\n- Markdownレンダリング対応',
    howToUse:
      '## 使い方\n\n1. テキストボックスに質問や指示を入力\n2. AIが応答を生成\n3. 会話履歴はセッション内で保持\n4. テンプレートから定型プロンプトを呼び出し可能',
    category: 'web',
    tags: ['React', 'TypeScript', 'OpenAI API', 'Node.js'],
    platform: ['Web'],
    icon: '',
    screenshots: [],
    links: { web: '#' },
    status: 'active',
    publishedAt: '2025-09-10',
    updatedAt: '2026-02-01',
  },
  {
    id: 'memoria',
    title: 'Memoria',
    subtitle: '思い出を記録・管理するアプリ',
    description:
      '# Memoria\n\n写真と日記で思い出を記録・管理するモバイルアプリ。\n\n## 特徴\n\n- カレンダーUIで日付ごとに閲覧\n- 写真・テキスト・位置情報を紐づけ\n- タグ検索・全文検索\n- データのローカル保存（プライバシー重視）',
    howToUse:
      '## 使い方\n\n1. 日付を選んで新しい記録を追加\n2. 写真を撮影 or ギャラリーから選択\n3. テキストや気分を記録\n4. カレンダーやタグで振り返り',
    category: 'mobile',
    tags: ['React Native', 'SQLite', 'Expo', 'TypeScript'],
    platform: ['iOS', 'Android'],
    icon: '',
    screenshots: [],
    links: {},
    status: 'coming-soon',
    publishedAt: '2026-01-01',
    updatedAt: '2026-03-15',
  },
  {
    id: 'mobile-omniverse',
    title: 'Mobile Omniverse',
    subtitle: 'モバイル統合プラットフォーム',
    description:
      '# Mobile Omniverse\n\n複数のモバイルアプリ機能を統合するプラットフォーム。\n\n## 特徴\n\n- モジュール式アーキテクチャ\n- プラグインで機能拡張\n- 統一されたUI/UXフレームワーク\n- クロスモジュール通信',
    howToUse:
      '## 使い方\n\n1. アプリを起動\n2. ホーム画面からモジュールを選択\n3. 各モジュールの機能を利用\n4. 設定からモジュールの有効/無効を切り替え',
    category: 'mobile',
    tags: ['React Native', 'TypeScript', 'Module Federation'],
    platform: ['iOS', 'Android'],
    icon: '',
    screenshots: [],
    links: { github: '#' },
    status: 'active',
    publishedAt: '2025-07-20',
    updatedAt: '2026-02-10',
  },
  {
    id: 'mobile-bex',
    title: 'Mobile BEX',
    subtitle: 'モバイルブラウザ拡張',
    description:
      '# Mobile BEX\n\nモバイルブラウザ向けの拡張機能フレームワーク。\n\n## 特徴\n\n- モバイルブラウザ上で拡張機能を実行\n- コンテンツスクリプトの注入\n- ポップアップUI対応\n- 設定のクラウド同期',
    howToUse:
      '## 使い方\n\n1. BEXアプリをインストール\n2. 拡張機能を追加\n3. ブラウザで閲覧中に拡張機能が自動適用\n4. BEXアプリから拡張機能を管理',
    category: 'extension',
    tags: ['TypeScript', 'WebView', 'Chrome Extension API'],
    platform: ['Android'],
    icon: '',
    screenshots: [],
    links: { download: '#' },
    status: 'active',
    publishedAt: '2025-11-05',
    updatedAt: '2026-03-01',
  },
];

export const categoryLabel: Record<string, string> = {
  web: 'Web App',
  mobile: 'Mobile App',
  extension: 'Extension',
  tool: 'Tool',
  other: 'Other',
};

export const categoryEmoji: Record<string, string> = {
  web: '🌐',
  mobile: '📱',
  extension: '🧩',
  tool: '🛠️',
  other: '📦',
};

export const statusLabel: Record<string, { text: string; color: string }> = {
  active: { text: 'Active', color: '#00C853' },
  development: { text: 'In Dev', color: '#FFB347' },
  'coming-soon': { text: 'Coming Soon', color: '#60A5FA' },
  archived: { text: 'Archived', color: '#888' },
};
