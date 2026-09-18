/**
 * The investigation entry for a data point's action menu. Starts an
 * investigation for an idle anomaly, reopens the card for one that is
 * running, done or failed, and renders nothing when the row has no flagged
 * anomaly.
 */
import type { Insight, QueryInsights } from '@lightdash/query-sdk';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Sparkles } from 'lucide-react';
import { markerFor } from './markers';

type Props = {
    insights: QueryInsights;
    row: Record<string, unknown> | null | undefined;
    /** The clicked series' `dataKey`, from the marker's `onOpenMenu`. */
    fieldId?: string;
    /** Called with the anomaly whose card should be shown. */
    onOpen: (anomaly: Insight) => void;
};

export function InvestigateMenuItem({
    insights,
    row,
    fieldId,
    onOpen,
}: Props) {
    const anomaly = markerFor(insights, row, fieldId);
    if (!anomaly) return null;

    if (anomaly.investigation.status === 'idle') {
        if (!insights.canInvestigate) return null;
        return (
            <DropdownMenuItem
                onSelect={() => {
                    insights.investigate(anomaly.id);
                    onOpen(anomaly);
                }}
            >
                <Sparkles className="mr-2 h-4 w-4" />
                Investigate with AI
            </DropdownMenuItem>
        );
    }

    return (
        <DropdownMenuItem onSelect={() => onOpen(anomaly)}>
            <Sparkles className="mr-2 h-4 w-4" />
            View investigation
        </DropdownMenuItem>
    );
}
