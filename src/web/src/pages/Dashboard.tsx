import React, { useEffect, useState } from 'react';
import { fetchStats, fetchSessions } from '../api/client.js';

interface Props {
  onNavigate: (page: string, sessionId?: string) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    fetchStats().then(setStats);
    fetchSessions({ limit: '5' }).then(data => setRecent(data.sessions ?? []));
  }, []);

  if (!stats) return <div className="text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sessions" value={stats.totalSessions} />
        <StatCard label="User Messages" value={stats.totalUserMessages} />
        <StatCard label="Assistant Messages" value={stats.totalAssistantMessages} />
        <StatCard label="Total Tokens" value={((stats.totalInputTokens + stats.totalOutputTokens) / 1000000).toFixed(1) + 'M'} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Recent Sessions</h3>
        <div className="space-y-2">
          {recent.map((s: any) => (
            <div
              key={s.sessionId}
              className="bg-gray-800 rounded p-3 cursor-pointer hover:bg-gray-750 border border-gray-700 hover:border-cyan-600"
              onClick={() => onNavigate('session-detail', s.sessionId)}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-mono text-cyan-400">{s.sessionId.slice(0, 8)}</span>
                <span className="text-xs text-gray-500">{s.lastTimestamp ? new Date(s.lastTimestamp).toLocaleDateString() : ''}</span>
              </div>
              <div className="text-sm text-gray-300 mt-1 truncate">
                {s.firstUserMessage || s.project?.split('/').slice(-2).join('/')}
              </div>
              {s.label && <span className="inline-block mt-1 text-xs bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded">{s.label}</span>}
            </div>
          ))}
        </div>
      </div>

      {stats.models && Object.keys(stats.models).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Model Usage</h3>
          <div className="bg-gray-800 rounded p-4 border border-gray-700">
            {Object.entries(stats.models as Record<string, number>)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([model, count]) => (
                <div key={model} className="flex justify-between py-1">
                  <span className="text-sm text-gray-300">{model}</span>
                  <span className="text-sm text-cyan-400">{count as number}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-2xl font-bold text-cyan-400">{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}
