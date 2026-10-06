import type { CSSProperties, ReactNode } from 'react';
import type { IssueStatus } from '../types.js';

const iconProps = {
  width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

// Per-column line icons, feather-style to match the rest of the app.
const COLUMN_ICONS: Record<IssueStatus, ReactNode> = {
  backlog: (
    <svg {...iconProps}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  todo: (
    <svg {...iconProps}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  in_progress: (
    <svg {...iconProps}>
      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  ),
  in_review: (
    <svg {...iconProps}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  blocked: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  ),
  done: (
    <svg {...iconProps}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  canceled: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
};

// Capsule-style board column header; the capsule tint is derived from the
// column color via CSS color-mix (see .column-header-capsule in index.css).
export default function BoardColumnHeader({ status, label, color, count, onAdd }: {
  status: IssueStatus;
  label: string;
  color: string;
  count: number;
  onAdd: () => void;
}) {
  return (
    <div className="column-header-capsule" style={{ '--col': color } as CSSProperties}>
      <span className="column-icon">{COLUMN_ICONS[status]}</span>
      <span className="column-title">{label}</span>
      <span className="column-count">{count}</span>
      <button
        className="column-add-btn"
        title="在此列新建 Issue"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14" /><path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
