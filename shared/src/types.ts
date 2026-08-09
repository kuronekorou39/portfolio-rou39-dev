export interface ProjectLinks {
  github?: string;
  web?: string;
  appStore?: string;
  playStore?: string;
  download?: string;
}

/**
 * ダウンロードの識別子。GET /downloads/{id}?os={os} はこの値で1件を引くため、
 * 同一プロジェクト内で重複させてはいけない(重複すると先頭の1件しか返らない)。
 * 同じOSに複数の配布形式がある場合は `mac-arm` のようにサフィックス付きを使う。
 */
export type DownloadOS =
  | 'windows' | 'windows-msi' | 'windows-exe'
  | 'mac' | 'mac-arm' | 'mac-intel'
  | 'linux' | 'android' | 'ios' | 'other';

export interface DownloadEntry {
  label: string;   // e.g. "Windows (x64)", "macOS (Apple Silicon)"
  url: string;
  os: DownloadOS;
}

export type ProjectCategory = 'web' | 'mobile' | 'desktop' | 'chrome-ext' | 'burp-ext' | 'other';
export type ProjectStatus = 'active' | 'development' | 'coming-soon' | 'archived';
export type ProjectSize = 'large' | 'medium' | 'small';

export interface Project {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  howToUse: string;
  category: ProjectCategory;
  tags: string[];
  platform: string[];
  icon: string;
  screenshots: string[];
  links: ProjectLinks;
  downloads?: DownloadEntry[];
  published?: boolean;
  /** トップページの Featured 枠に優先的に出す。未指定分は updatedAt の新しい順で補完される */
  featured?: boolean;
  status: ProjectStatus;
  size: ProjectSize;
  publishedAt: string;
  updatedAt: string;
  /** GET /projects が埋め込む集計値。単体取得 (GET /projects/{id}) には含まれない */
  viewCount?: number;
  downloadCount?: number;
}

export interface Review {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageView {
  projectId: string;
  count: number;
}

export interface Interest {
  projectId: string;
  userId: string;
  createdAt: string;
}

export interface InterestCount {
  projectId: string;
  count: number;
  interested: boolean; // current user has shown interest
}

export interface Comment {
  id: string;
  projectId: string;
  parentId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  replyCount?: number;
}
