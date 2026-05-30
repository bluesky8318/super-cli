import React, { useEffect, useState } from 'react';
import { fetchSessions } from '../api/client.js';

interface Props {
  onSelectSession: (id: string) => void;
}

export default function Sessions({ onSelectSession }: Props) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetchSessions({ limit: String(limit) }).then(data => {
      setSessions(data.sessions ?? []);
      setLoading(false);
    });
  }, [limit]);

  const filtered = filter
    ? sessions.filter(s =>
        s.project?.toLowerCase().includes(filter.toLowerCase()) ||
        s.firstUserMessage?.toLowerCase().includes(filter.toLowerCase()) ||
        s.label?.toLowerCase().includes(filter.toLowerCase()) ||
        s.gitBranch?.toLowerCase().includes(filter.toLowerCase())
      )
    : sessions;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Sessions</h2>
        <input
          type="text"
          placeholder="Filter..."
          className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:border-cyan-500 focus:outline-none"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-gray-400">Loading sessions...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Project</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Branch</th>
                  <th className="pb-2 pr-4">Msgs</th>
                  <th className="pb-2 pr-4">Label</th>
                  <th className="pb-2">First Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: any) => (
                  <tr
                    key={s.sessionId}
                    className="border-b border-gray-800 hover:bg-gray-800 cursor-pointer"
                    onClick={() => onSelectSession(s.sessionId)}
                  >
                    <td className="py-2 pr-4 font-mono text-cyan-400">{s.sessionId.slice(0, 8)}</td>
                    <td className="py-2 pr-4 text-gray-300">{s.project?.split('/').slice(-2).join('/')}</td>
                    <td className="py-2 pr-4 text-gray-400">{s.lastTimestamp ? new Date(s.lastTimestamp).toLocaleDateString() : '-'}</td>
                    <td className="py-2 pr-4 text-gray-400">{s.gitBranch ?? '-'}</td>
                    <td className="py-2 pr-4 text-gray-400">{(s.userMessageCount ?? 0) + (s.assistantMessageCount ?? 0)}</td>
                    <td className="py-2 pr-4">{s.label ? <span className="bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded text-xs">{s.label}</span> : '-'}</td>
                    <td className="py-2 text-gray-400 truncate max-w-xs">{s.firstUserMessage ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="text-sm text-cyan-400 hover:text-cyan-300"
            onClick={() => setLimit(l => l + 30)}
          >
            Load more...
          </button>
        </>
      )}
    </div>
  );
}
