import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api';

function getSessionId(): string {
  return sessionStorage.getItem('hp_sid') ?? 'anonymous';
}

async function logAction(action: string, detail: string = '') {
  try {
    await fetch(`${API_BASE}/honeypot/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'action', action, detail, sessionId: getSessionId() }),
    });
  } catch { /* silent */ }
}

type Section = 'dashboard' | 'users' | 'projects' | 'server' | 'logs' | 'settings';

// Fake data
const fakeUsers = [
  { id: 1, name: 'rou39', email: 'admin@rou39.com', role: 'admin', lastLogin: '2026-04-01 09:12' },
  { id: 2, name: 'test_user', email: 'test@example.com', role: 'user', lastLogin: '2026-03-31 18:45' },
  { id: 3, name: 'reviewer01', email: 'reviewer@gmail.com', role: 'user', lastLogin: '2026-03-30 14:20' },
  { id: 4, name: 'dev_tanaka', email: 'tanaka@rou39.com', role: 'editor', lastLogin: '2026-03-29 22:10' },
  { id: 5, name: 'guest_abc', email: 'guest123@yahoo.co.jp', role: 'user', lastLogin: '2026-03-28 10:00' },
];

const fakeLogs = [
  { time: '2026-04-01 10:32:15', level: 'INFO', message: 'Deployment completed: frontend v2.4.1' },
  { time: '2026-04-01 10:30:02', level: 'INFO', message: 'CloudFront cache invalidation started' },
  { time: '2026-04-01 09:12:45', level: 'WARN', message: 'High memory usage on Lambda: 89%' },
  { time: '2026-04-01 08:00:00', level: 'INFO', message: 'Daily backup completed (DynamoDB → S3)' },
  { time: '2026-03-31 23:55:12', level: 'ERROR', message: 'Rate limit exceeded: API Gateway 429' },
  { time: '2026-03-31 22:30:01', level: 'INFO', message: 'SSL certificate renewed: rou39.com' },
  { time: '2026-03-31 18:45:33', level: 'INFO', message: 'User login: test_user (103.x.x.x)' },
  { time: '2026-03-31 15:00:00', level: 'INFO', message: 'Scheduled maintenance window started' },
];

const fakeStats = {
  totalUsers: 47,
  activeToday: 12,
  totalProjects: 18,
  totalReviews: 34,
  storageUsed: '2.4 GB',
  apiCalls: '12,847',
  uptime: '99.97%',
  lastDeploy: '2026-04-01 10:32',
};

export default function AdminDashboardPage() {
  const [section, setSection] = useState<Section>('dashboard');
  const [showModal, setShowModal] = useState<string | null>(null);
  const navigate = useNavigate();
  const adminUser = sessionStorage.getItem('hp_user') ?? 'admin';

  useEffect(() => {
    if (!sessionStorage.getItem('hp_token')) {
      navigate('/admin', { replace: true });
      return;
    }
    logAction('dashboard-visit', section);
  }, [navigate, section]);

  const handleAction = (action: string, detail: string = '') => {
    logAction(action, detail);
    setShowModal(action);
    setTimeout(() => setShowModal(null), 3000);
  };

  const handleLogout = () => {
    logAction('logout');
    sessionStorage.removeItem('hp_token');
    sessionStorage.removeItem('hp_user');
    navigate('/admin');
  };

  const nav: { key: Section; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'ダッシュボード', icon: '📊' },
    { key: 'users', label: 'ユーザー管理', icon: '👥' },
    { key: 'projects', label: 'プロジェクト管理', icon: '📁' },
    { key: 'server', label: 'サーバー管理', icon: '🖥️' },
    { key: 'logs', label: 'システムログ', icon: '📋' },
    { key: 'settings', label: '設定', icon: '⚙️' },
  ];

  const esc = (s: string) => {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  };
  void esc;

  return (
    <div className="flex h-screen bg-[#0d1117] text-gray-300">
      {/* Sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-[#161b22]">
        <div className="border-b border-gray-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white">R</div>
            <div>
              <div className="text-xs font-semibold text-white">rou39 Admin</div>
              <div className="text-[10px] text-gray-500">v2.4.1</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => { setSection(item.key); logAction('nav', item.key); }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                section === item.key
                  ? 'bg-gray-800/50 text-white'
                  : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-gray-800 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-green-600 text-center text-xs leading-6 text-white">
              {adminUser[0].toUpperCase()}
            </div>
            <span className="text-xs text-gray-400">{adminUser}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full rounded px-2 py-1 text-left text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          {/* Dashboard */}
          {section === 'dashboard' && (
            <div>
              <h1 className="mb-6 text-xl font-bold text-white">ダッシュボード</h1>
              <div className="mb-8 grid grid-cols-4 gap-4">
                {[
                  { label: 'ユーザー数', value: fakeStats.totalUsers, color: 'blue' },
                  { label: '今日のアクティブ', value: fakeStats.activeToday, color: 'green' },
                  { label: 'API呼び出し (24h)', value: fakeStats.apiCalls, color: 'purple' },
                  { label: '稼働率', value: fakeStats.uptime, color: 'emerald' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-gray-800 bg-[#161b22] p-4">
                    <div className="text-xs text-gray-500">{stat.label}</div>
                    <div className="mt-1 text-2xl font-bold text-white">{stat.value}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-800 bg-[#161b22] p-4">
                  <h3 className="mb-3 text-sm font-medium text-gray-400">最近のアクティビティ</h3>
                  <div className="space-y-2">
                    {fakeLogs.slice(0, 5).map((log, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <span className="shrink-0 text-gray-600">{log.time.split(' ')[1]}</span>
                        <span className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-gray-400'}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-800 bg-[#161b22] p-4">
                  <h3 className="mb-3 text-sm font-medium text-gray-400">システム情報</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">ストレージ使用量</span><span>{fakeStats.storageUsed}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">プロジェクト数</span><span>{fakeStats.totalProjects}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">レビュー数</span><span>{fakeStats.totalReviews}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">最終デプロイ</span><span>{fakeStats.lastDeploy}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">リージョン</span><span>ap-northeast-1</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">CDN</span><span>CloudFront (d1ahc...)</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users */}
          {section === 'users' && (
            <div>
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">ユーザー管理</h1>
                <button
                  onClick={() => handleAction('create-user')}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  + ユーザー追加
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-[#161b22] text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">名前</th>
                      <th className="px-4 py-3 text-left">メール</th>
                      <th className="px-4 py-3 text-left">権限</th>
                      <th className="px-4 py-3 text-left">最終ログイン</th>
                      <th className="px-4 py-3 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {fakeUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-gray-500">{u.id}</td>
                        <td className="px-4 py-3 text-white">{u.name}</td>
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-xs ${
                            u.role === 'admin' ? 'bg-red-900/30 text-red-400'
                            : u.role === 'editor' ? 'bg-yellow-900/30 text-yellow-400'
                            : 'bg-gray-800 text-gray-400'
                          }`}>{u.role}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.lastLogin}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleAction('edit-user', u.name)} className="mr-2 text-xs text-blue-400 hover:underline">編集</button>
                          <button onClick={() => handleAction('delete-user', u.name)} className="text-xs text-red-400 hover:underline">削除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Projects */}
          {section === 'projects' && (
            <div>
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">プロジェクト管理</h1>
                <div className="flex gap-2">
                  <button onClick={() => handleAction('export-projects')} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-white">エクスポート</button>
                  <button onClick={() => handleAction('import-projects')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">インポート</button>
                </div>
              </div>
              <div className="space-y-2">
                {['jinrou-verse', 'omniverse', 'koko-meshi', 'u2b-loop', 'icon-builder', 'flowscope'].map((id) => (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#161b22] px-4 py-3">
                    <span className="text-sm text-white">{id}</span>
                    <div className="flex gap-2">
                      <button onClick={() => handleAction('edit-project', id)} className="text-xs text-blue-400 hover:underline">編集</button>
                      <button onClick={() => handleAction('reset-reviews', id)} className="text-xs text-yellow-400 hover:underline">レビュー初期化</button>
                      <button onClick={() => handleAction('delete-project', id)} className="text-xs text-red-400 hover:underline">削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Server */}
          {section === 'server' && (
            <div>
              <h1 className="mb-6 text-xl font-bold text-white">サーバー管理</h1>
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-800 bg-[#161b22] p-6">
                  <h3 className="mb-4 text-sm font-medium text-white">サービス制御</h3>
                  <div className="space-y-3">
                    {[
                      { name: 'API Gateway', status: 'running', action: 'restart-api' },
                      { name: 'Lambda Functions', status: 'running', action: 'restart-lambda' },
                      { name: 'CloudFront CDN', status: 'running', action: 'invalidate-cdn' },
                      { name: 'DynamoDB', status: 'running', action: 'stop-db' },
                    ].map((svc) => (
                      <div key={svc.name} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          <span className="text-sm">{svc.name}</span>
                          <span className="text-xs text-green-400">{svc.status}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAction(svc.action, svc.name)} className="rounded bg-yellow-600/20 px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-600/30">再起動</button>
                          <button onClick={() => handleAction('stop-' + svc.name.toLowerCase(), svc.name)} className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-400 hover:bg-red-600/30">停止</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-red-900/50 bg-red-900/10 p-6">
                  <h3 className="mb-2 text-sm font-medium text-red-400">危険な操作</h3>
                  <p className="mb-4 text-xs text-gray-500">以下の操作は取り消しできません。慎重に実行してください。</p>
                  <div className="flex gap-3">
                    <button onClick={() => handleAction('reset-database')} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700">
                      データベース初期化
                    </button>
                    <button onClick={() => handleAction('delete-all-users')} className="rounded-lg border border-red-700 px-4 py-2 text-xs text-red-400 hover:bg-red-900/30">
                      全ユーザー削除
                    </button>
                    <button onClick={() => handleAction('shutdown-all')} className="rounded-lg border border-red-700 px-4 py-2 text-xs text-red-400 hover:bg-red-900/30">
                      全サービス停止
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Logs */}
          {section === 'logs' && (
            <div>
              <h1 className="mb-6 text-xl font-bold text-white">システムログ</h1>
              <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0d1117] font-mono text-xs">
                {fakeLogs.map((log, i) => (
                  <div key={i} className="flex gap-3 border-b border-gray-800/50 px-4 py-2 hover:bg-gray-800/20">
                    <span className="shrink-0 text-gray-600">{log.time}</span>
                    <span className={`shrink-0 w-12 ${
                      log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-gray-500'
                    }`}>[{log.level}]</span>
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          {section === 'settings' && (
            <div>
              <h1 className="mb-6 text-xl font-bold text-white">設定</h1>
              <div className="max-w-lg space-y-4">
                {[
                  { label: 'サイト名', value: 'rou39.com', type: 'text' },
                  { label: 'メンテナンスモード', value: '', type: 'toggle' },
                  { label: '管理者メール', value: 'admin@rou39.com', type: 'text' },
                  { label: 'API レート制限 (req/min)', value: '100', type: 'text' },
                  { label: 'バックアップ間隔', value: '24h', type: 'text' },
                ].map((setting) => (
                  <div key={setting.label} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#161b22] px-4 py-3">
                    <span className="text-sm text-gray-300">{setting.label}</span>
                    {setting.type === 'toggle' ? (
                      <button
                        onClick={() => handleAction('toggle-maintenance')}
                        className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400 hover:bg-gray-600"
                      >OFF</button>
                    ) : (
                      <input
                        defaultValue={setting.value}
                        className="w-48 rounded border border-gray-700 bg-[#0d1117] px-2 py-1 text-right text-xs text-gray-300 outline-none focus:border-blue-500"
                        onBlur={(e) => handleAction('change-setting', `${setting.label}: ${e.target.value}`)}
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={() => handleAction('save-settings')}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  設定を保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action feedback modal */}
      {showModal && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-gray-700 bg-[#161b22] px-4 py-3 text-sm text-gray-300 shadow-xl">
          <span className="mr-2 text-green-400">✓</span>
          操作を実行しました: {showModal}
        </div>
      )}
    </div>
  );
}
