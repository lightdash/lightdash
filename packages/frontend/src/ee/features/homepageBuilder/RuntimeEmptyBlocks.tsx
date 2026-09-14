import {
    useCallback,
    useMemo,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { EmptyBlocksContext } from './hooks/useRuntimeEmptyBlocks';

/** Holds which blocks resolved to nothing, so rows containing only those can
 * collapse. See useReportRuntimeEmpty for why this can't be config-derived. */
export const RuntimeEmptyBlocksProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const [emptyBlockIds, setEmptyBlockIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );

    const reportEmpty = useCallback((blockId: string, isEmpty: boolean) => {
        setEmptyBlockIds((current) => {
            if (current.has(blockId) === isEmpty) return current;
            const next = new Set(current);
            if (isEmpty) next.add(blockId);
            else next.delete(blockId);
            return next;
        });
    }, []);

    const value = useMemo(
        () => ({ emptyBlockIds, reportEmpty }),
        [emptyBlockIds, reportEmpty],
    );

    return (
        <EmptyBlocksContext.Provider value={value}>
            {children}
        </EmptyBlocksContext.Provider>
    );
};
