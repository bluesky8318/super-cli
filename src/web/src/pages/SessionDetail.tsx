import React, { useEffect, useState } from 'react';
import { fetchSession, fetchSessionMessages } from '../api/client.js';

interface Props {
  sessionId: string;
  onBack: () => void;
}

export default function SessionDetail({ sessionId, onBack }: Props) {
  const [meta, setMeta] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSession(sessionId),
      fetchSessionMessages(sessionId, { limit: '200' }),
    ]).then(([m, msgs]) => {
      setMeta(m);
      setMessages(msgs.messages ?? []);
      setLoading(false);
    });
  }, [sessionId]);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!meta) return <div className="text-red-400">Session not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button className="text-cyan-400 hover:text-cyan-300 text-sm" onClick={onBack}>&larr; Back</button>
        <h2 className="text-xl font-bold font-mono">{meta.sessionId?.slice(0, 8)}</h2>
        {meta.label && <span className="bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded text-sm">{meta.label}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <InfoCard label="Project" value={meta.project} />
        <InfoCard label="Branch" value={meta.gitBranch ?? '-'} />
        <InfoCard label="Started" value={meta.firstTimestamp ? new Date(meta.firstTimestamp).toLocaleString() : '-'} />
        <InfoCard label="Last Active" value={meta.lastTimestamp ? new Date(meta.lastTimestamp).toLocaleString() : '-'} />
        <InfoCard label="Messages" value={`${meta.userMessageCount ?? 0} / ${meta.assistantMessageCount ?? 0}`} />
        <InfoCard label="Tokens" value={`${((meta.totalInputTokens ?? 0) / 1000).toFixed(0)}k in / ${((meta.totalOutputTokens ?? 0) / 1000).toFixed(0)}k out`} />
        <InfoCard label="Models" value={meta.models?.join(', ') ?? '-'} />
        <InfoCard label="Version" value={meta.version ?? '-'} />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Conversation</h3>
        <div className="space-y-3">
          {messages.map((msg: any, i: number) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="text-gray-200 mt-0.5 truncate">{value}</div>
    </div>
  );
}

function MessageBubble({ message }: { message: any }) {
  const isUser = message.type === 'user';
  const content = extractContent(message.content);

  return (
    <div className={`p-3 rounded-lg ${isUser ? 'bg-gray-800 border-l-2 border-green-500' : 'bg-gray-800 border-l-2 border-blue-500'}`}>
      <div className="flex justify-between items-center mb-1">
        <span className={`text-xs font-semibold ${isUser ? 'text-green-400' : 'text-blue-400'}`}>
          {isUser ? 'User' : 'Assistant'}
        </span>
        <span className="text-xs text-gray-500">
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
          {message.model && ` · ${message.model}`}
        </span>
      </div>
      <div className="text-sm text-gray-200 whitespace-pre-wrap break-words">
        {content.slice(0, 1000)}
        {content.length > 1000 && <span className="text-gray-500">... (truncated)</span>}
      </div>
    </div>
  );
}

function extractContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (block.type === 'text') return block.text ?? '';
        if (block.type === 'tool_use') return `[Tool: ${block.name}]`;
        if (block.type === 'tool_result') return `[Result]`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content);
}
