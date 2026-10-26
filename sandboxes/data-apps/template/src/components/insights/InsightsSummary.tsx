/**
 * The view-level analysis block. Renders nothing when the host has no
 * analysis to offer (embeds, tiles, org not rolled out).
 */
import { useInsights } from '@lightdash/query-sdk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
    title?: ReactNode;
    /** Shown before the first run. */
    idleText?: string;
    /** Guidance for the analysis model: language/format rules and a line or
     *  two of domain vocabulary. One string per app. */
    instructions?: string;
    className?: string;
};

export function InsightsSummary({
    title = 'Executive summary',
    idleText = 'Click Analyse for an AI-generated read of everything on this page.',
    instructions,
    className,
}: Props) {
    // Always pass the options object so clearing the prop clears the
    // guidance instead of leaving the previous value in force.
    const view = useInsights({ instructions });
    if (view.status === 'unavailable') return null;
    const busy = view.status === 'analysing';

    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    {title}
                </CardTitle>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={view.analyse}
                    disabled={busy}
                >
                    {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                    {view.status === 'ready' ? 'Regenerate' : 'Analyse'}
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {view.status === 'idle' && (
                    <p className="text-sm text-muted-foreground">{idleText}</p>
                )}
                {busy && (
                    <p className="text-sm text-muted-foreground">
                        Reading the data on this page…
                    </p>
                )}
                {view.status === 'error' && (
                    <p className="text-sm text-destructive">
                        {view.error ?? 'The analysis failed. Try again.'}
                    </p>
                )}
                {view.status === 'ready' && (
                    <>
                        {view.stale && (
                            <p className="text-xs text-muted-foreground">
                                The view changed since this was generated.
                                Regenerate to update.
                            </p>
                        )}
                        {view.headline && (
                            <p className="font-semibold leading-snug">
                                {view.headline}
                            </p>
                        )}
                        {view.summary && (
                            <p className="text-sm leading-relaxed">
                                {view.summary}
                            </p>
                        )}
                        {view.limitations.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                                {view.limitations.map((limitation) => (
                                    <li key={limitation}>{limitation}</li>
                                ))}
                            </ul>
                        )}
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            AI-generated from the data on this page
                            {view.dataAsOf ? ` · Data as of ${view.dataAsOf}` : ''}
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
