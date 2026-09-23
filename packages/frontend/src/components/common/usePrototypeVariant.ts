import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

// PROTOTYPE ONLY. Reads and writes `?variant=` on the current route.

export type PrototypeVariant<K extends string> = { key: K; name: string };

export const usePrototypeVariant = <K extends string>(
    variants: readonly PrototypeVariant<K>[],
): { current: K; setVariant: (key: K) => void } => {
    const [searchParams, setSearchParams] = useSearchParams();
    const param = searchParams.get('variant');
    const current =
        variants.find((variant) => variant.key === param)?.key ??
        variants[0].key;
    const setVariant = useCallback(
        (key: K) => {
            const next = new URLSearchParams(searchParams);
            next.set('variant', key);
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams],
    );
    return { current, setVariant };
};
