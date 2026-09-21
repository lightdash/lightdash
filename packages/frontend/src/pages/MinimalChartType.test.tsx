import {
    SCREENSHOT_SELECTORS,
    type DataAppVizContext,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';
import MinimalChartType from './MinimalChartType';

const mocks = vi.hoisted(() => ({
    metadata: vi.fn(),
    iframe: vi.fn(),
    identifier: '11111111-1111-4111-8111-111111111111',
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useParams: () => ({
        projectUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        dataAppVizUuid: mocks.identifier,
    }),
}));
vi.mock('../features/apps/hooks/useGetApp', () => ({
    useGetApp: () => ({
        data: { pages: [{ appUuid: '11111111-1111-4111-8111-111111111111' }] },
    }),
}));
vi.mock('../features/chartTypes/hooks/useDataAppVizRender', () => ({
    useDataAppVizRenderMetadata: mocks.metadata,
    useDataAppVizPreviewToken: () => ({ data: 'preview-token' }),
}));
vi.mock('../hooks/appearance/useResolvedColorPalette', () => ({
    useResolvedColorPalette: () => ['#123456'],
}));
vi.mock('../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [vi.fn(), { width: 800, height: 600 }],
}));
vi.mock('../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.lightdash.test',
}));
vi.mock('../features/apps/AppIframePreview', () => ({
    default: (props: {
        onIframeLoad?: () => void;
        onScreenshotAvailabilityChange?: (available: boolean) => void;
        dataAppVizContext: DataAppVizContext;
    }) => {
        mocks.iframe(props);
        return (
            <>
                <Button onClick={props.onIframeLoad}>Load preview</Button>
                <Button
                    onClick={() => props.onScreenshotAvailabilityChange?.(true)}
                >
                    SDK ready
                </Button>
            </>
        );
    },
}));

describe('MinimalChartType', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.metadata.mockReturnValue({
            data: {
                state: 'ready',
                version: 3,
                schema: {
                    fields: [
                        { name: 'category', type: 'dimension', required: true },
                        { name: 'value', type: 'metric', required: true },
                    ],
                    configOptions: [],
                    colorPalette: null,
                },
            },
        });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it.each(['11111111-1111-4111-8111-111111111111', 'radial-gauge'])(
        'captures %s using gallery sample data only after the iframe has loaded and settled',
        (identifier) => {
            mocks.identifier = identifier;
            const { container } = renderWithProviders(<MinimalChartType />);
            const ready = () =>
                container.querySelector(SCREENSHOT_SELECTORS.READY_INDICATOR);
            expect(ready()).toBeNull();
            act(() => {
                vi.advanceTimersByTime(8000);
            });
            expect(ready()).toBeNull();

            const props = mocks.iframe.mock.lastCall?.[0];
            expect(props.dataAppVizContext.rows.length).toBeGreaterThan(0);
            expect(props.dataAppVizContext.fieldMapping).toEqual({
                category: 'sample_category',
                value: 'sample_value',
            });
            expect(props.dataAppVizMode).toBe(true);
            expect(props.src).toContain(
                '/api/apps/11111111-1111-4111-8111-111111111111/versions/3/t/preview-token/',
            );

            fireEvent.click(
                screen.getByRole('button', { name: 'Load preview' }),
            );
            act(() => {
                vi.advanceTimersByTime(8000);
            });
            expect(ready()).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'SDK ready' }));
            act(() => {
                vi.advanceTimersByTime(1499);
            });
            expect(ready()).toBeNull();
            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(ready()).toHaveAttribute('data-status', 'ready');
        },
    );
});
