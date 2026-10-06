import type { CliProvider, IssuePriority, IssueStatus, SessionStatus } from './types.js';

export const PROVIDER_COLORS: Record<CliProvider, string> = {
  'claude-code': '#d97706',
  'qoder': '#7c3aed',
  'codex': '#059669',
  'kimi': '#f43f5e',
  'pi': '#ec4899',
  'opencode': '#0ea5e9',
  'workbuddy': '#14b8a6',
  'traecode': '#3b82f6',
};

export const PROVIDER_LABELS: Record<CliProvider, string> = {
  'claude-code': 'CC',
  'qoder': 'QD',
  'codex': 'CX',
  'kimi': 'KM',
  'pi': 'PI',
  'opencode': 'OC',
  'workbuddy': 'WB',
  'traecode': 'TC',
};

export const ISSUE_COLUMNS: { key: IssueStatus; label: string; color: string }[] = [
  { key: 'backlog', label: '需求池', color: '#6b7280' },
  { key: 'todo', label: '待办', color: '#f59e0b' },
  { key: 'in_progress', label: '进行中', color: '#3b82f6' },
  { key: 'in_review', label: '待复查', color: '#8b5cf6' },
  { key: 'blocked', label: '阻塞', color: '#ef4444' },
  { key: 'done', label: '已完成', color: '#10b981' },
  { key: 'canceled', label: '已取消', color: '#9ca3af' },
];

export const ISSUE_PRIORITY_META: { key: IssuePriority; label: string; color: string }[] = [
  { key: 'urgent', label: '紧急', color: '#ef4444' },
  { key: 'high', label: '高', color: '#f97316' },
  { key: 'medium', label: '中', color: '#3b82f6' },
  { key: 'low', label: '低', color: '#9ca3af' },
];

// Map a session's derived status onto the 7-column issue board.
export function sessionStatusToColumn(status: SessionStatus): IssueStatus {
  switch (status) {
    case 'backlog': return 'todo';
    case 'in_progress': return 'in_progress';
    case 'review': return 'in_review';
    case 'done': return 'done';
    case 'cancelled': return 'canceled';
  }
}
