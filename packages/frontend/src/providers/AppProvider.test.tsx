import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderHookWithProviders } from '../testing/testUtils';
import { useApp } from './AppProvider';

describe('AppProvider', () => {
    it('should throw if used outside of AppProvider', () => {
        expect(() => {
            renderHook(() => useApp());
        }).toThrow('useApp must be used within a AppProvider');
    });

    it('should return values from AppProvider', () => {
        expect(async () => {
            const { result } = renderHookWithProviders(() => useApp());

            await waitFor(() =>
                expect(result.current.health.isLoading).toBe(false),
            );
            await waitFor(() =>
                expect(result.current.user.isLoading).toBe(false),
            );

            expect(result.current.health.data).toBeDefined();
            expect(result.current.user.data).toBeDefined();

            expect(result.current.health.data).toHaveProperty('siteUrl');
            expect(result.current.user.data).toHaveProperty(
                'email',
                'demo@lightdash.com',
            );
        }).not.toThrow();
    });
});
