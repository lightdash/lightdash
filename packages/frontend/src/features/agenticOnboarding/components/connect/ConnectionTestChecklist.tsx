import {
    type ConnectionCheckId,
    type ConnectionDiagnosticResult,
} from '@lightdash/common';
import { useReducedMotion } from '@mantine-8/hooks';
import { useEffect, useMemo, useState, type FC } from 'react';
import StepChecklist, { type StepChecklistItem } from './StepChecklist';

const MIN_REPLAY_MS = 250;
const MAX_REPLAY_MS = 1200;

type ExpectedCheck = { id: ConnectionCheckId; label: string };

const DEFAULT_CHECKS: ExpectedCheck[] = [
    { id: 'resolve_host', label: 'Resolve host' },
    { id: 'open_connection', label: 'Open secure connection' },
    { id: 'authenticate', label: 'Authenticate' },
    { id: 'list_schemas', label: 'List schemas' },
    { id: 'select_1', label: 'Run select 1' },
];

const clampReplayDelay = (durationMs: number | null): number => {
    if (durationMs === null) return MIN_REPLAY_MS;
    return Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, durationMs));
};

type ConnectionTestChecklistProps = {
    result: ConnectionDiagnosticResult | null;
    isLoading: boolean;
    expectedChecks?: ExpectedCheck[];
};

const ConnectionTestChecklist: FC<ConnectionTestChecklistProps> = ({
    result,
    isLoading,
    expectedChecks = DEFAULT_CHECKS,
}) => {
    const reducedMotion = useReducedMotion();
    const [revealedCount, setRevealedCount] = useState(0);

    const revealLimit = useMemo(() => {
        if (!result) return 0;
        const failIndex = result.checks.findIndex((c) => c.status === 'failed');
        return failIndex >= 0 ? failIndex + 1 : result.checks.length;
    }, [result]);

    useEffect(() => {
        if (!result) {
            setRevealedCount(0);
            return undefined;
        }
        if (reducedMotion) {
            setRevealedCount(revealLimit);
            return undefined;
        }
        // Replay each check as "running" for a delay scaled to how long it
        // actually took, then flip it to its final status one at a time.
        setRevealedCount(0);
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        const scheduleNext = (index: number) => {
            if (cancelled || index >= revealLimit) return;
            const delay = clampReplayDelay(
                result.checks[index]?.durationMs ?? null,
            );
            timeoutId = setTimeout(() => {
                if (cancelled) return;
                setRevealedCount(index + 1);
                scheduleNext(index + 1);
            }, delay);
        };
        scheduleNext(0);
        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [result, revealLimit, reducedMotion]);

    const items = useMemo<StepChecklistItem[]>(() => {
        if (!result) {
            return expectedChecks.map((check, index) => ({
                id: check.id,
                label: check.label,
                status: isLoading && index === 0 ? 'running' : 'pending',
                durationMs: null,
            }));
        }

        return result.checks.map((check, index) => {
            if (index < revealedCount) {
                return {
                    id: check.id,
                    label: check.label,
                    status: check.status,
                    durationMs: check.durationMs,
                };
            }
            if (index === revealedCount && revealedCount < revealLimit) {
                return {
                    id: check.id,
                    label: check.label,
                    status: 'running',
                    durationMs: null,
                };
            }
            return {
                id: check.id,
                label: check.label,
                status: 'pending',
                durationMs: null,
            };
        });
    }, [result, isLoading, revealedCount, revealLimit, expectedChecks]);

    return (
        <StepChecklist items={items} hasFailure={result?.status === 'failed'} />
    );
};

export default ConnectionTestChecklist;
