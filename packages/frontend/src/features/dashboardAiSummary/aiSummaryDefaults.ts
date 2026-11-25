import { type DashboardAiSummaryTileProperties } from '@lightdash/common';

export const DEFAULT_AI_SUMMARY_PROPERTIES: DashboardAiSummaryTileProperties['properties'] =
    {
        title: 'AI summary',
        instructions: null,
        scope: { type: 'tab' },
    };

// Sent when the author wrote no instructions, so the result reads as a
// summary with next steps rather than a list of anomalies.
export const DEFAULT_AI_SUMMARY_INSTRUCTIONS =
    'Summarise what these charts show for a business reader. Lead with what changed and why it matters, then say what to do next.';
