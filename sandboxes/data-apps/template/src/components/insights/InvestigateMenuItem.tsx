/**
 * The "Investigate with AI" entry for a data point's action menu. Renders
 * nothing when the row has no flagged anomaly, when no agent is available,
 * or when an investigation is already running or done.
 */
import type { Insight, QueryInsights } from '@lightdash/query-sdk';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Sparkles } from 'lucide-react';
import { markerFor } from './markers';

type Props = {
    insights: QueryInsights;
    row: Record<string, unknown> | null | undefined;
    /** Called with the anomaly after the investigation starts, e.g. to show its card. */
    onInvestigate?: (anomaly: Insight) => void;
};

export function InvestigateMenuItem({ insights, row, onInvestigate }: Props) {
    const anomaly = markerFor(insights, row);
    if (
        !anomaly ||
        !insights.canInvestigate ||
        anomaly.investigation.status !== 'idle'
    ) {
        return null;
    }
    return (
        <DropdownMenuItem
            onSelect={() => {
                insights.investigate(anomaly.id);
                onInvestigate?.(anomaly);
            }}
        >
            <Sparkles className="mr-2 h-4 w-4" />
            Investigate with AI
        </DropdownMenuItem>
    );
}
