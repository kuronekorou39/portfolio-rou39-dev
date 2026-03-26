import { Link } from 'react-router-dom';
import type { Project } from '../../../shared/src/types';

// TODO: APIから取得に置き換え
const mockProjects: Project[] = [
  {
    id: 'u2b-loop',
    title: 'U2B Loop',
    subtitle: 'YouTube動画の区間リピートツール',
    description: '',
    howToUse: '',
    category: 'web',
    tags: ['React', 'TypeScript'],
    platform: ['Web'],
    icon: '',
    screenshots: [],
    links: { web: '#' },
    status: 'active',
    publishedAt: '2025-01-01',
    updatedAt: '2025-01-01',
  },
  {
    id: 'koko-meshi',
    title: 'Koko-Meshi',
    subtitle: '近くの飯屋をサッと探す',
    description: '',
    howToUse: '',
    category: 'mobile',
    tags: ['React Native', 'Firebase'],
    platform: ['iOS', 'Android'],
    icon: '',
    screenshots: [],
    links: {},
    status: 'active',
    publishedAt: '2025-03-01',
    updatedAt: '2025-03-01',
  },
  {
    id: 'domain-traffic-inspector',
    title: 'Domain Traffic Inspector',
    subtitle: 'ドメインのトラフィックを可視化',
    description: '',
    howToUse: '',
    category: 'extension',
    tags: ['Chrome Extension', 'TypeScript'],
    platform: ['Chrome'],
    icon: '',
    screenshots: [],
    links: {},
    status: 'active',
    publishedAt: '2025-06-01',
    updatedAt: '2025-06-01',
  },
];

const categoryLabel: Record<string, string> = {
  web: 'Web App',
  mobile: 'Mobile App',
  extension: 'Extension',
  tool: 'Tool',
  other: 'Other',
};

export default function AppsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Apps</h1>
      <p className="mb-12 text-gray-500 dark:text-gray-400">
        開発したアプリケーション一覧
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {mockProjects.map((project) => (
          <Link
            key={project.id}
            to={`/apps/${project.id}`}
            className="group rounded-2xl border border-gray-200 p-6 transition-all hover:border-gray-400 hover:shadow-lg dark:border-gray-800 dark:hover:border-gray-600"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-xl dark:bg-gray-800">
                {project.category === 'web'
                  ? '🌐'
                  : project.category === 'mobile'
                    ? '📱'
                    : '🧩'}
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  {categoryLabel[project.category]}
                </span>
              </div>
            </div>
            <h2 className="mb-1 text-xl font-semibold group-hover:text-blue-500">
              {project.title}
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {project.subtitle}
            </p>
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
