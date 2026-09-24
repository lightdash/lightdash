import { assertUnreachable } from '@lightdash/common';
import type { ChartIntentContext, InstantReplyKind } from './chartIntent';

type InstantReplyChart = {
    exploreLabel: string;
    context: ChartIntentContext;
};

const labels = (fields: { label: string }[]) =>
    fields.map(({ label }) => label).join(', ');

/** What the chart asks the warehouse for, read from its own query so nothing is guessed. */
const describeQuery = ({ exploreLabel, context }: InstantReplyChart) => {
    const { sorts } = context.artifact.config.queryConfig;
    const labelOf = (id: string) =>
        context.currentFields.find((field) => field.id === id)?.label ?? id;
    return [
        `This chart queries **${exploreLabel}**:`,
        context.chartMetrics.length > 0
            ? `- Metrics: ${labels(context.chartMetrics)}`
            : null,
        context.chartDimensions.length > 0
            ? `- Breakdowns: ${labels(context.chartDimensions)}`
            : null,
        context.filters.length > 0
            ? `- Filters: ${context.filters.join('; ')}`
            : null,
        sorts.length > 0
            ? `- Sorted by: ${sorts
                  .map(
                      ({ fieldId, descending }) =>
                          `${labelOf(fieldId)} (${descending ? 'highest first' : 'lowest first'})`,
                  )
                  .join(', ')}`
            : null,
        '',
        'For the exact SQL, open the **⋯** menu on the chart and choose **View SQL**.',
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
};

/** Fixed replies for small follow-ups; null when this turn cannot be answered without the agent. */
export const composeInstantReply = ({
    kind,
    chart,
    canDownload,
}: {
    kind: InstantReplyKind;
    chart: InstantReplyChart | null;
    canDownload: boolean;
}): string | null => {
    switch (kind) {
        case 'acknowledgement':
            return 'Glad that helps. Ask me anything else about this data.';
        case 'show_query':
            return chart ? describeQuery(chart) : null;
        case 'download_help':
            return chart && canDownload
                ? 'Open the **⋯** menu on the chart and choose **Download results** to get the data, or **Export image** for a picture of the chart.'
                : null;
        default:
            return assertUnreachable(kind, 'Unknown instant reply');
    }
};
