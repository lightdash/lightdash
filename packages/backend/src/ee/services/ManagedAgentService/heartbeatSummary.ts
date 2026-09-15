import {
    ManagedAgentActionType,
    ManagedAgentTargetType,
    type ManagedAgentAction,
} from '@lightdash/common';

type SummaryAction = Pick<
    ManagedAgentAction,
    'actionType' | 'targetType' | 'targetName' | 'reversedAt'
>;

// Ledger labels are a contract: the activity page, Slack and the live
// suites read them back as `- Label: N`.
const ledgerLabels: [ManagedAgentActionType, string][] = [
    [ManagedAgentActionType.FLAGGED_STALE, 'Stale flags'],
    [ManagedAgentActionType.FLAGGED_BROKEN, 'Broken flags'],
    [ManagedAgentActionType.FLAGGED_SLOW, 'Slow-query flags'],
    [ManagedAgentActionType.FIXED_BROKEN, 'Repairs'],
    [ManagedAgentActionType.CREATED_CONTENT, 'Created content'],
    [ManagedAgentActionType.SOFT_DELETED, 'Soft-deletions'],
];

const signOffs = [
    'Back on the next run. There is always something around the corner.',
    'The project is in better shape than it was this morning, and that is the whole goal.',
    'That is everything for this run. Go build something good.',
    'I will be back. I always find something eventually.',
    'Carry on. You are doing better than you think.',
];

const quoteName = (name: string) =>
    `\`${name.replace(/[`\r\n]/g, ' ').slice(0, 120)}\``;

const uniqueNames = (group: SummaryAction[]) => [
    ...new Set(group.map((action) => action.targetName)),
];

const examples = (names: string[], max: number) =>
    names.slice(0, max).map(quoteName).join(', ');

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// Deterministic per run so a report never changes when it is re-read.
const pick = <T>(items: T[], seed: string): T => {
    const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return items[hash % items.length];
};

const describeTargets = (group: SummaryAction[]) => {
    const charts = group.filter(
        (action) => action.targetType === ManagedAgentTargetType.CHART,
    ).length;
    const dashboards = group.filter(
        (action) => action.targetType === ManagedAgentTargetType.DASHBOARD,
    ).length;
    const parts: string[] = [];
    if (charts) parts.push(`${charts} ${plural(charts, 'chart', 'charts')}`);
    if (dashboards)
        parts.push(
            `${dashboards} ${plural(dashboards, 'dashboard', 'dashboards')}`,
        );
    if (parts.length === 0)
        parts.push(`${group.length} ${plural(group.length, 'item', 'items')}`);
    return parts.join(' and ');
};

export type HeartbeatSummaryContext = {
    attribution: {
        provider: string | null;
        model: string | null;
        keySource: 'organization' | 'instance' | null;
    } | null;
    notice: string | null;
};

type Segment = { count: number; story: string; segment: string | null };

const buildSegments = (active: SummaryAction[]): Segment[] => {
    const byType = (type: ManagedAgentActionType) =>
        active.filter((action) => action.actionType === type);
    const stale = byType(ManagedAgentActionType.FLAGGED_STALE);
    const deleted = byType(ManagedAgentActionType.SOFT_DELETED);
    const repaired = byType(ManagedAgentActionType.FIXED_BROKEN);
    const broken = byType(ManagedAgentActionType.FLAGGED_BROKEN);
    const slow = byType(ManagedAgentActionType.FLAGGED_SLOW);
    const created = byType(ManagedAgentActionType.CREATED_CONTENT);
    const insights = byType(ManagedAgentActionType.INSIGHT);
    const segments: Segment[] = [];

    if (deleted.length || stale.length) {
        const story: string[] = [];
        if (deleted.length)
            story.push(
                `I retired ${describeTargets(deleted)} that had been flagged and left untouched, ${examples(uniqueNames(deleted), 2)} among them. Soft-deleted, so nothing is gone for good.`,
            );
        if (stale.length)
            story.push(
                `I flagged ${describeTargets(stale)} nobody has opened in a while, including ${examples(uniqueNames(stale), 2)}. They stay put until the next pass, so shout if any of them still matter.`,
            );
        segments.push({
            count: deleted.length + stale.length,
            story: story.join(' '),
            segment: `🧹 **The Sweep**\n${[
                stale.length
                    ? `${stale.length} stale ${plural(stale.length, 'item', 'items')} flagged`
                    : null,
                deleted.length
                    ? `${deleted.length} ${plural(deleted.length, 'item', 'items')} soft-deleted`
                    : null,
            ]
                .filter(Boolean)
                .join(', ')}.`,
        });
    }
    if (repaired.length || broken.length || slow.length) {
        const story: string[] = [];
        if (repaired.length)
            story.push(
                `I repaired ${describeTargets(repaired)} (${examples(uniqueNames(repaired), 2)}) that were pointing at fields that no longer exist. Whoever renamed those without a migration: I fixed it, but I want you to think about what you did.`,
            );
        if (broken.length)
            story.push(
                `${broken.length} more ${plural(broken.length, 'is', 'are')} broken in ways I would rather a human looked at first, so ${plural(broken.length, 'it is', 'they are')} flagged rather than touched.`,
            );
        if (slow.length)
            story.push(
                `${slow.length} ${plural(slow.length, 'query is', 'queries are')} slow enough to be worth an admin's attention.`,
            );
        segments.push({
            count: repaired.length + broken.length + slow.length,
            story: story.join(' '),
            segment: `🔧 **Fixed in the Field**\n${[
                repaired.length
                    ? `${repaired.length} broken ${plural(repaired.length, 'chart', 'charts')} repaired`
                    : null,
                broken.length ? `${broken.length} flagged as broken` : null,
                slow.length ? `${slow.length} flagged as slow` : null,
            ]
                .filter(Boolean)
                .join(', ')}.`,
        });
    }
    if (created.length) {
        segments.push({
            count: created.length,
            story: `Your team kept asking questions the project could not answer, so I built ${created.length} ${plural(created.length, 'chart', 'charts')} (${examples(uniqueNames(created), 2)}). ${plural(created.length, 'It is', 'They are')} in Agent Suggestions whenever you have a moment.`,
            segment: `💡 **Fresh Picks**\n${created.length} ${plural(created.length, 'chart', 'charts')} built from questions your team asked, waiting in Agent Suggestions.`,
        });
    }
    // Lead with the biggest change; notes always close the story.
    const ordered = segments.sort((a, b) => b.count - a.count);
    if (insights.length) {
        ordered.push({
            count: insights.length,
            story: `I also left ${insights.length} ${plural(insights.length, 'note', 'notes')} on the activity page about things worth a look.`,
            segment: null,
        });
    }
    return ordered;
};

// Built only from saved actions: one snapshot feeds the stored run summary,
// the activity page and the Slack thread. Standard markdown: the page
// renders it and Slack accepts it in markdown blocks. The voice follows the
// Slack messaging skill; the ledger at the end keeps every count exact.
export const renderHeartbeatSummary = ({
    actions,
    interrupted,
    projectName,
    seed,
    context = { attribution: null, notice: null },
}: {
    actions: SummaryAction[] | null;
    interrupted: boolean;
    projectName: string | null;
    seed: string;
    context?: HeartbeatSummaryContext;
}): { text: string; compactSummary: string } => {
    const title = `**${projectName ?? 'Your project'}: Autopilot update**`;
    if (actions === null) {
        return {
            text: `${title}\n\nThe saved action report is unavailable. Review this run in the activity page.`,
            compactSummary: 'Saved action report unavailable',
        };
    }
    const active = actions.filter((action) => !action.reversedAt);
    const blocked = active.filter(
        (action) => action.actionType === ManagedAgentActionType.BLOCKED,
    ).length;
    const insights = active.filter(
        (action) => action.actionType === ManagedAgentActionType.INSIGHT,
    ).length;
    const reversed = actions.length - active.length;
    const segments = buildSegments(active);
    const changes = segments
        .filter((segment) => segment.segment !== null)
        .reduce((sum, segment) => sum + segment.count, 0);

    const paragraphs: string[] = [title];
    if (interrupted) {
        paragraphs.push(
            'This run was cut short, so this is what got saved before it stopped.',
        );
    }
    if (context.notice) paragraphs.push(context.notice);
    if (changes === 0 && !interrupted) {
        paragraphs.push(
            insights
                ? `I did the full sweep and found nothing to fix: nothing broke, nothing went stale, and nobody asked a question the project could not answer. I did leave ${insights} ${plural(insights, 'note', 'notes')} on the activity page about things worth a look, but that is a compliment, not a to-do list.`
                : 'I did the full sweep and found nothing to fix: nothing broke, nothing went stale, and nobody asked a question the project could not answer. In BI terms that is a standing ovation.',
        );
    } else {
        paragraphs.push(segments.map((segment) => segment.story).join(' '));
        if (changes > 0 && changes <= 3) {
            paragraphs.push(
                'Beyond that I did the full sweep and came up mostly empty, which is a clean bill of health.',
            );
        }
    }
    if (blocked) {
        paragraphs.push(
            `${blocked} ${plural(blocked, 'thing', 'things')} I tried ${plural(blocked, 'was', 'were')} refused by the project rules, which is exactly what the rules are for. ${plural(blocked, 'It is', 'They are')} listed on the activity page as refused attempts.`,
        );
    }
    const namedSegments = segments
        .filter((segment) => segment.segment !== null)
        .map((segment) => segment.segment as string);
    if (changes > 3 && namedSegments.length >= 2) {
        paragraphs.push(...namedSegments);
    }

    const ledger = ['**By the numbers**', ''];
    const headline: string[] = [];
    for (const [type, label] of ledgerLabels) {
        const group = active.filter((action) => action.actionType === type);
        const names = uniqueNames(group);
        const more =
            names.length > 3 ? `; ${names.length - 3} more targets` : '';
        const shown = examples(names, 3);
        ledger.push(
            `- ${label}: ${group.length}${shown ? ` (${shown}${more})` : ''}`,
        );
        if (group.length) headline.push(`${label}: ${group.length}`);
    }
    ledger.push(
        `- Insights for review: ${insights}`,
        `- Refused attempts: ${blocked}`,
    );
    if (reversed) ledger.push(`- Reversed or dismissed actions: ${reversed}`);
    if (context.attribution?.model) {
        const { provider, model, keySource } = context.attribution;
        const key =
            keySource === 'organization'
                ? "your organisation's key"
                : 'the instance key';
        ledger.push(
            `- Ran on: ${provider ? `${provider} / ` : ''}${model} with ${key}`,
        );
    }
    paragraphs.push(ledger.join('\n'));
    paragraphs.push(pick(signOffs, seed));
    if (insights) headline.push(`Insights: ${insights}`);
    if (blocked) headline.push(`Refused attempts: ${blocked}`);
    if (reversed) headline.push(`Reversed or dismissed: ${reversed}`);
    return {
        text: paragraphs.join('\n\n'),
        compactSummary: headline.join(' · ') || 'No saved actions',
    };
};
