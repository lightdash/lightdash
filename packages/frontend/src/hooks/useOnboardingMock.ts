import { useCallback } from 'react';

/**
 * Returns a react-query `select` that swaps real data for deterministic mock
 * rows while `enabled` (e.g. a tour is running), so onboarding always shows the
 * same content. Pass `mockData` as a stable (module-level) reference.
 *
 *   const select = useOnboardingMock(EXAMPLE_ROWS, isTourOpen);
 *   const { data } = useThings(args, { select });
 */
export const useOnboardingMock = <T>(
    mockData: T[],
    enabled: boolean,
): ((data: T[]) => T[]) =>
    useCallback(
        (data: T[]) => (enabled ? mockData : data),
        [mockData, enabled],
    );
