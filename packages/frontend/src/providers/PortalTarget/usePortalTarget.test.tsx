import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalTargetContext } from './PortalTargetContext';
import { usePortalTarget } from './usePortalTarget';

describe('usePortalTarget', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('falls back to the document body outside a provider', () => {
        const { result } = renderHook(() => usePortalTarget());
        expect(result.current).toBe(document.body);
    });

    it('resolves the provided selector when the element exists', () => {
        const target = document.createElement('div');
        target.id = 'sdk-portal';
        document.body.appendChild(target);

        const { result } = renderHook(() => usePortalTarget(), {
            wrapper: ({ children }) => (
                <PortalTargetContext.Provider value="#sdk-portal">
                    {children}
                </PortalTargetContext.Provider>
            ),
        });
        expect(result.current).toBe(target);
    });

    it('falls back to the document body when the selector matches nothing', () => {
        const { result } = renderHook(() => usePortalTarget(), {
            wrapper: ({ children }) => (
                <PortalTargetContext.Provider value="#missing">
                    {children}
                </PortalTargetContext.Provider>
            ),
        });
        expect(result.current).toBe(document.body);
    });
});
