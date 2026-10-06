import skillMd from '../../skills/super-cli-taskboard/SKILL.md';

export const ISSUE_SKILL_NAME = 'super-cli-taskboard';

// Bundled agent skill teaching the issue-board claiming workflow.
// Source of truth: skills/super-cli-taskboard/SKILL.md (inlined at build time).
// Installed into each provider's global skills dir by `super-cli skill install`.
export const ISSUE_SKILL_MD = skillMd;
