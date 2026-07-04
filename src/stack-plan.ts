import { formatTokens } from './hive-api.js';

export type StackBudget = 'lean' | 'balanced' | 'capable';

export interface StackPlanItem {
  role: string;
  slug: string;
  name: string;
  type: string[];
  tagline: string;
  tokens: number;
  reason: string;
}

export interface OmittedStackRole {
  role: string;
  reason: string;
  bestSlug: string;
  tokens: number;
}

export interface StackPlan {
  brief: string;
  budget: StackBudget;
  summary: string;
  totalTokens: number;
  items: StackPlanItem[];
  omitted: OmittedStackRole[];
}

function typeLabel(types: string[]): string {
  return types.length ? types.join(', ') : 'tool';
}

export function formatStackPlan(plan: StackPlan): string {
  if (plan.items.length === 0) {
    return `${plan.summary}\n\nTry a more specific brief, or call discover(intent) for a single-tool search.`;
  }

  const lines = [
    plan.summary,
    '',
    ...plan.items.map((item) => {
      const tokens = formatTokens(item.tokens);
      return [
        `${item.role}: ${item.slug} (${typeLabel(item.type)}, ${tokens})`,
        `  ${item.tagline}`,
        `  Why: ${item.reason}`,
      ].join('\n');
    }),
  ];

  if (plan.omitted.length) {
    lines.push('', 'Omitted:');
    for (const item of plan.omitted) {
      const tokenText = item.tokens > 0 ? `, ${formatTokens(item.tokens)}` : '';
      lines.push(`  ${item.role}: ${item.bestSlug || 'no match'}${tokenText}. ${item.reason}`);
    }
  }

  lines.push('', 'Next: call install(slug) for each slug you want to add.');
  return lines.join('\n');
}
