import { type ApiCaptureRouteRequest } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../../../api';
import { routeCapture } from './routeCapture';

describe('routeCapture', () => {
    it('posts the recording to the sorter for the project', async () => {
        const route = { layout: [], questions: [], edits: [] };
        const lightdashApi = vi.fn(
            async () => route,
        ) as unknown as LightdashApi;
        const request: ApiCaptureRouteRequest = {
            dashboardName: 'Weekly KPIs',
            gridColumns: 36,
            tiles: [],
            marks: [],
            looseSpeech: ['make it bigger'],
            images: [],
        };

        await expect(
            routeCapture(lightdashApi, 'project-1', request),
        ).resolves.toEqual(route);
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/aiRouter/capture/project-1',
                method: 'POST',
                body: JSON.stringify(request),
            }),
        );
    });
});
