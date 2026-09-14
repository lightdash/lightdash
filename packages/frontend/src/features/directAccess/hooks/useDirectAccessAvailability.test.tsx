import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContentReviewAvailability } from '../../../ee/features/contentReview/hooks/useContentReviewAvailability';
import useApp from '../../../providers/App/useApp';
import { useDirectAccessAvailability } from './useDirectAccess';

vi.mock('../../../providers/App/useApp');

describe.each([useDirectAccessAvailability, useContentReviewAvailability])(
    '%s',
    (useAvailability) => {
        it.each([
            { valid: true, isLoading: false, isAvailable: true },
            { valid: false, isLoading: false, isAvailable: false },
            { valid: undefined, isLoading: false, isAvailable: false },
            { valid: undefined, isLoading: true, isAvailable: false },
        ])(
            'returns $isAvailable with license validity $valid and loading $isLoading',
            ({ valid, isLoading, isAvailable }) => {
                vi.mocked(useApp).mockReturnValue({
                    health: {
                        data:
                            valid === undefined
                                ? undefined
                                : { license: { valid } },
                        isInitialLoading: isLoading,
                    },
                } as ReturnType<typeof useApp>);
                const { result } = renderHook(useAvailability);
                expect(result.current).toEqual({ isAvailable, isLoading });
            },
        );
    },
);
