import type { CSSProperties } from 'react';
import { ISSUE_PRIORITY_META, PROVIDER_COLORS, PROVIDER_LABELS } from '../constants.js';
import type { IssueSummary, SessionItem } from '../types.js';

function FlagIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function IssueCard({ issue, sessions, isSelected, isDragging, onClick, onDragStart, onDragEnd }: {
  issue: IssueSummary;
  sessions: SessionItem[];
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const priority = ISSUE_PRIORITY_META.find(p => p.key === issue.priority);
  // An issue counts as actively processed when any bound session is a live process.
  const isActive = issue.sessionIds.some(sid => sessions.find(s => s.sessionId === sid)?.active);
  const hasChips = priority !== undefined || issue.labels.length > 0 || issue.sessionIds.length > 0;

  return (
    <div
      className={`issue-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', issue.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="issue-card-top">
        <span className="issue-identifier">{issue.identifier}</span>
        {issue.commentCount > 0 && (
          <span className="issue-comment-count"><CommentIcon />{issue.commentCount}</span>
        )}
      </div>
      <div className="issue-card-title">{issue.title}</div>
      {hasChips && (
        <div className="issue-card-chips">
          {priority && (
            <span className="priority-pill" style={{ '--p': priority.color } as CSSProperties}>
              <FlagIcon />{priority.label}
            </span>
          )}
          {issue.labels.map(l => <span key={l} className="label-chip">{l}</span>)}
          <span className="issue-card-avatars">
            {issue.sessionIds.map(sid => {
              const s = sessions.find(x => x.sessionId === sid);
              return s ? (
                <span key={sid} className="provider-avatar" title={sid} style={{ background: PROVIDER_COLORS[s.provider] }}>
                  {PROVIDER_LABELS[s.provider]}
                </span>
              ) : (
                <span key={sid} className="provider-avatar unknown" title={sid}>{sid.slice(0, 2)}</span>
              );
            })}
          </span>
        </div>
      )}
      {isActive && (
        <div className="issue-active-row">
          <span className="active-progress"><i /><i /><i /><i /></span>
          <span className="active-text">agent 处理中…</span>
        </div>
      )}
    </div>
  );
}
