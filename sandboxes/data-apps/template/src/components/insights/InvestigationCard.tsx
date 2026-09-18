/**
 * Renders one anomaly's investigation state under its chart. The app owns
 * where it appears; Lightdash owns the run.
 */
import type { Insight, QueryInsights } from '@lightdash/query-sdk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, X } from 'lucide-react';
import { Markdown } from './Markdown';

type Props = {
    anomaly: Insight;
    insights: QueryInsights;
    onDismiss?: () => void;
    className?: string;
};

export function InvestigationCard({
    anomaly,
    insights,
    onDismiss,
    className,
}: Props) {
    const { investigation } = anomaly;
    if (investigation.status === 'idle') return null;

    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <CardTitle className="text-sm font-medium leading-snug">
                    Investigation · {anomaly.text}
                </CardTitle>
                {onDismiss && (
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Dismiss"
                        onClick={onDismiss}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {investigation.status === 'running' && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Investigating… this can take a minute.
                    </p>
                )}
                {investigation.status === 'error' && (
                    <>
                        <p className="text-destructive">
                            {investigation.error ?? 'The investigation failed.'}
                        </p>
                        {insights.canInvestigate && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => insights.investigate(anomaly.id)}
                            >
                                Investigate again
                            </Button>
                        )}
                    </>
                )}
                {investigation.status === 'ready' && (
                    <>
                        <Markdown text={investigation.explanation ?? ''} />
                        {investigation.partial && (
                            <p className="text-xs text-muted-foreground">
                                The query budget ran out; this is a partial
                                answer.
                            </p>
                        )}
                        {insights.canContinue && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    insights.continueInAskAi(anomaly.id)
                                }
                            >
                                <MessageSquare className="h-4 w-4" />
                                Continue in Ask AI
                            </Button>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
