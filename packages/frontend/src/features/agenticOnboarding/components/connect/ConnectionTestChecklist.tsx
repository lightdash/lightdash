import {
    type ConnectionCheckId,
    type ConnectionDiagnosticResult,
} from '@lightdash/common';
import { useReducedMotion } from '@mantine-8/hooks';
import { useEffect, useMemo, useState, type FC } from 'react';
import StepChecklist, { type StepChecklistItem } from './StepChecklist';

const REVEAL_STAGGER_MS = 250;
const RUNNING_STAGGER_MS = 500;

const DEFAULT_CHECKS: { id: ConnectionCheckId; label: string }[] = [
    { id: 'resolve_host', label: 'Resolve host' },
    { id: 'open_connection', label: 'Open secure connection' },
    { id: 'authenticate', label: 'Authenticate' },
    { id: 'list_schemas', label: 'List schemas' },
    { id: 'select_1', label: 'Run select 1' },
];

type ConnectionTestChecklistProps = {
    result: ConnectionDiagnosticResult | null;
    isLoading: boolean;
};

const ConnectionTestChecklist: FC<ConnectionTestChecklistProps> = ({
    result,
    isLoading,
}) => {
    const reducedMotion = useReducedMotion();
    const [runningPointer, setRunningPointer] = useState(0);
    const [revealedCount, setRevealedCount] = useState(0);

    useEffect(() => {
        if (!isLoading || result) return undefined;
        setRunningPointer(0);
        const interval = setInterval(() => {
            setRunningPointer((prev) =>
                Math.min(prev + 1, DEFAULT_CHECKS.length - 1),
            );
        }, RUNNING_STAGGER_MS);
        return () => clearInterval(interval);
    }, [isLoading, result]);

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
        setRevealedCount(0);
        const interval = setInterval(() => {
            setRevealedCount((prev) => {
                if (prev >= revealLimit) {
                    clearInterval(interval);
                    return prev;
                }
                return prev + 1;
            });
        }, REVEAL_STAGGER_MS);
        return () => clearInterval(interval);
    }, [result, revealLimit, reducedMotion]);

    const items = useMemo<StepChecklistItem[]>(() => {
        if (!result) {
            return DEFAULT_CHECKS.map((check, index) => ({
                id: check.id,
                label: check.label,
                status:
                    isLoading && index === runningPointer
                        ? 'running'
                        : 'pending',
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
    }, [result, isLoading, runningPointer, revealedCount, revealLimit]);

    return (
        <StepChecklist items={items} hasFailure={result?.status === 'failed'} />
    );
};

export default ConnectionTestChecklist;
