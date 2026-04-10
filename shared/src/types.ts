export interface ProjectLinks {
  github?: string;
  web?: string;
  appStore?: string;
  playStore?: string;
  download?: string;
}

export interface DownloadEntry {
  label: string;   // e.g. "Windows (x64)", "macOS (Apple Silicon)"
  url: string;
  os: 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'other';
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
  status: ProjectStatus;
  size: ProjectSize;
  publishedAt: string;
  updatedAt: string;
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
