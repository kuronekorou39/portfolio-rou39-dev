export interface Avatar {
  key: string;
  emoji: string;
  label: string;
}

// 15個以上のアバター（動物の絵文字）
export const avatars: Avatar[] = [
  { key: 'rabbit', emoji: '🐰', label: 'うさぎ' },
  { key: 'cat', emoji: '🐱', label: 'ねこ' },
  { key: 'frog', emoji: '🐸', label: 'カエル' },
  { key: 'dog', emoji: '🐶', label: 'いぬ' },
  { key: 'panda', emoji: '🐼', label: 'パンダ' },
  { key: 'penguin', emoji: '🐧', label: 'ペンギン' },
  { key: 'bear', emoji: '🐻', label: 'くま' },
  { key: 'fox', emoji: '🦊', label: 'きつね' },
  { key: 'koala', emoji: '🐨', label: 'コアラ' },
  { key: 'hamster', emoji: '🐹', label: 'ハムスター' },
  { key: 'owl', emoji: '🦉', label: 'フクロウ' },
  { key: 'dolphin', emoji: '🐬', label: 'イルカ' },
  { key: 'chick', emoji: '🐥', label: 'ひよこ' },
  { key: 'whale', emoji: '🐳', label: 'クジラ' },
  { key: 'squirrel', emoji: '🐿️', label: 'リス' },
];

// アバターのkeyからemoji取得（見つからない場合はデフォルト）
export function getAvatarEmoji(key: string | undefined): string {
  return avatars.find((a) => a.key === key)?.emoji ?? '👤';
}

// ランダムなニックネーム生成: "匿名{動物}{2桁数字}"
// 名前と一致するアバターのkeyも返す
export function generateRandomIdentity(): { nickname: string; avatarKey: string } {
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return {
    nickname: `匿名${avatar.label}${num}`,
    avatarKey: avatar.key,
  };
}
