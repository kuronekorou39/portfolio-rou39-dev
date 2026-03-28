export interface ProjectLinks {
  github?: string;
  web?: string;
  appStore?: string;
  playStore?: string;
  download?: string;
}

export type ProjectCategory = 'web' | 'mobile' | 'extension' | 'tool' | 'other';
export type ProjectStatus = 'active' | 'development' | 'archived';

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
  status: ProjectStatus;
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
