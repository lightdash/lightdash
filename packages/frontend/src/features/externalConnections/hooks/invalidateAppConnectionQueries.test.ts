import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateAppConnectionQueries } from './invalidateAppConnectionQueries';

describe('invalidateAppConnectionQueries', () => {
    it('refreshes linked connections and both preview token types', async () => {
        const queryClient = new QueryClient();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

        await invalidateAppConnectionQueries(
            queryClient,
            'project-uuid',
            'app-uuid',
        );

        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'app-external-connections',
                'project-uuid',
                'app-uuid',
            ],
        });
        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['external-connections', 'project-uuid'],
        });
        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: [
                'data-app-viz-preview-token',
                'project-uuid',
                'app-uuid',
            ],
        });
        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['app-preview-token', 'project-uuid', 'app-uuid'],
        });
    });
});
