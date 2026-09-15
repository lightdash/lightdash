import {
    ManagedAgentActionType,
    type ManagedAgentAction,
} from '@lightdash/common';

type SummaryAction = Pick<
    ManagedAgentAction,
    'actionType' | 'targetName' | 'reversedAt'
>;

const actionLabels: [ManagedAgentActionType, string][] = [
    [ManagedAgentActionType.FLAGGED_STALE, 'Stale flags'],
    [ManagedAgentActionType.FLAGGED_BROKEN, 'Broken flags'],
    [ManagedAgentActionType.FLAGGED_SLOW, 'Slow-query flags'],
    [ManagedAgentActionType.FIXED_BROKEN, 'Repairs'],
    [ManagedAgentActionType.CREATED_CONTENT, 'Created content'],
    [ManagedAgentActionType.SOFT_DELETED, 'Soft-deletions'],
];

const quoteName = (name: string) =>
    `\`${name.replace(/[`\r\n]/g, ' ').slice(0, 120)}\``;

// Built only from saved actions: one snapshot feeds the stored run summary,
// the activity page and the Slack thread. Standard markdown: the page
// renders it and Slack accepts it in markdown blocks.
export const renderHeartbeatSummary = ({
    actions,
    interrupted,
}: {
    actions: SummaryAction[] | null;
    interrupted: boolean;
}): { text: string; compactSummary: string } => {
    if (actions === null) {
        return {
            text: '**Autopilot activity**\n\nThe saved action report is unavailable. Review this run in the activity page.',
            compactSummary: 'Saved action report unavailable',
        };
    }
    const active = actions.filter((action) => !action.reversedAt);
    const lines = [
        '**Autopilot activity**',
        '',
        interrupted
            ? 'Run interrupted. Saved work is listed below.'
            : 'Run completed.',
        '',
        '**Actions in effect at report time**',
        '',
    ];
    const headline: string[] = [];
    for (const [type, label] of actionLabels) {
        const group = active.filter((action) => action.actionType === type);
        const names = [...new Set(group.map((action) => action.targetName))];
        const examples = names.slice(0, 3).map(quoteName).join(', ');
        const more =
            names.length > 3 ? `; ${names.length - 3} more targets` : '';
        lines.push(
            `- ${label}: ${group.length}${examples ? ` (${examples}${more})` : ''}`,
        );
        if (group.length) headline.push(`${label}: ${group.length}`);
    }
    const insights = active.filter(
        (action) => action.actionType === ManagedAgentActionType.INSIGHT,
    ).length;
    const blocked = active.filter(
        (action) => action.actionType === ManagedAgentActionType.BLOCKED,
    ).length;
    const reversed = actions.length - active.length;
    lines.push(
        '',
        '**Other saved activity**',
        '',
        `- Insights for review: ${insights}`,
        `- Refused attempts: ${blocked}`,
    );
    if (reversed) lines.push(`- Reversed or dismissed actions: ${reversed}`);
    lines.push(
        '',
        'See the activity page for findings and individual action details. Soft-deleted content is recoverable.',
    );
    if (insights) headline.push(`Insights: ${insights}`);
    if (blocked) headline.push(`Refused attempts: ${blocked}`);
    if (reversed) headline.push(`Reversed or dismissed: ${reversed}`);
    return {
        text: lines.join('\n'),
        compactSummary: headline.join(' · ') || 'No saved actions',
    };
};
