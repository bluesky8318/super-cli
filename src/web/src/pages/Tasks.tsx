import React, { useEffect, useState } from 'react';
import { fetchTasks } from '../api/client.js';

interface Props {
  onSelectSession: (id: string) => void;
}

export default function Tasks({ onSelectSession }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks().then(data => {
      setTasks(data.tasks ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-400">Loading tasks...</div>;

  if (tasks.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <div className="text-gray-400">
          No named tasks yet. Use <code className="bg-gray-800 px-1 rounded">super-cli name &lt;session-id&gt; &lt;label&gt;</code> to name a session.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Tasks</h2>
      <div className="grid gap-3">
        {tasks.map((task: any) => (
          <div
            key={task.sessionId}
            className="bg-gray-800 border border-gray-700 rounded-lg p-4 cursor-pointer hover:border-cyan-600"
            onClick={() => onSelectSession(task.sessionId)}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-gray-100">{task.label}</div>
                <div className="text-sm text-gray-400 mt-1">{task.project?.split('/').slice(-2).join('/')}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-cyan-400">{task.sessionId?.slice(0, 8)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {task.lastTimestamp ? new Date(task.lastTimestamp).toLocaleDateString() : ''}
                </div>
              </div>
            </div>
            {task.tags?.length > 0 && (
              <div className="flex gap-1 mt-2">
                {task.tags.map((tag: string) => (
                  <span key={tag} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            )}
            {task.firstUserMessage && (
              <div className="text-sm text-gray-400 mt-2 truncate">{task.firstUserMessage}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
