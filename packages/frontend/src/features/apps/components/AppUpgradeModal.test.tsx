import { type SdkFix } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type SdkUpgradeOffer } from '../hooks/useSdkUpgradeStatus';
import { useUpgradeApp } from '../hooks/useUpgradeApp';
import AppUpgradeModal from './AppUpgradeModal';

vi.mock('../hooks/useUpgradeApp', () => ({
    useUpgradeApp: vi.fn(),
}));

const metricFilters = {
    key: 'metric-filters',
    label: 'Metric filters',
    description: 'Filter grouped results by metric values.',
    wiring: 'Pass metric filters to the query builder.',
};
const transportFix: SdkFix = {
    key: 'data-app-transport-retry',
    label: 'Reliable data-app transport',
    description: 'Retries transient host transport failures after rebuilding.',
    appliesTo: ['data_app'],
};

const staleOffer: SdkUpgradeOffer = {
    status: 'stale',
    newFeatures: [{ ...metricFilters, appliesTo: ['data_app'] }],
    newFixes: [],
    candidateFeatures: [{ ...metricFilters, appliesTo: ['data_app'] }],
    reportedSdkVersion: '1.68.0',
    reportedFeatures: ['query'],
};

const fixesOnlyOffer: SdkUpgradeOffer = {
    ...staleOffer,
    newFeatures: [],
    newFixes: [transportFix],
    candidateFeatures: [],
};

describe('AppUpgradeModal', () => {
    it('submits the reported manifest and explains the chart type follow-up', () => {
        const onClose = vi.fn();
        const onStarted = vi.fn();
        const mutate = vi.fn((_params, options) =>
            options?.onSuccess?.({ appUuid: 'chart-1', version: 3 }),
        );
        vi.mocked(useUpgradeApp).mockReturnValue({
            mutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useUpgradeApp>);

        renderWithProviders(
            <AppUpgradeModal
                opened
                onClose={onClose}
                projectUuid="project-1"
                appUuid="chart-1"
                offer={staleOffer}
                resource="chartType"
                onStarted={onStarted}
            />,
        );

        expect(screen.getByText('Upgrade chart type')).toBeInTheDocument();
        expect(
            screen.getByText(/ask for features in the prompt bar/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/fields, options and defaults stay unchanged/i),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Start upgrade' }));

        expect(mutate).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                appUuid: 'chart-1',
                body: {
                    reportedSdkVersion: '1.68.0',
                    reportedFeatures: ['query'],
                    // Registry-only metadata (appliesTo) stays off the wire.
                    candidateFeatures: [metricFilters],
                },
            },
            expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
        expect(onStarted).toHaveBeenCalledWith({
            appUuid: 'chart-1',
            version: 3,
        });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('keeps the existing chat guidance for data apps', () => {
        vi.mocked(useUpgradeApp).mockReturnValue({
            mutate: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useUpgradeApp>);

        renderWithProviders(
            <AppUpgradeModal
                opened
                onClose={vi.fn()}
                projectUuid="project-1"
                appUuid="app-1"
                offer={staleOffer}
                resource="dataApp"
            />,
        );

        expect(screen.getByText('Upgrade app')).toBeInTheDocument();
        expect(
            screen.getByText(/ask for features in chat/i),
        ).toBeInTheDocument();
    });

    it('shows reported fixes without feature-wiring guidance', () => {
        vi.mocked(useUpgradeApp).mockReturnValue({
            mutate: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useUpgradeApp>);

        renderWithProviders(
            <AppUpgradeModal
                opened
                onClose={vi.fn()}
                projectUuid="project-1"
                appUuid="app-1"
                offer={fixesOnlyOffer}
                resource="dataApp"
            />,
        );

        expect(
            screen.getByText('Reliable data-app transport'),
        ).toBeInTheDocument();
        expect(screen.getByText('Fixes')).toBeInTheDocument();
        expect(
            screen.queryByText(/ask for them in chat/i),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(/chat will show the completed SDK upgrade/i),
        ).toBeInTheDocument();
    });

    it('keeps feature guidance when an upgrade includes features and fixes', () => {
        vi.mocked(useUpgradeApp).mockReturnValue({
            mutate: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useUpgradeApp>);

        renderWithProviders(
            <AppUpgradeModal
                opened
                onClose={vi.fn()}
                projectUuid="project-1"
                appUuid="app-1"
                offer={{ ...staleOffer, newFixes: [transportFix] }}
                resource="dataApp"
            />,
        );

        expect(screen.getByText('Metric filters')).toBeInTheDocument();
        expect(
            screen.getByText('Reliable data-app transport'),
        ).toBeInTheDocument();
        expect(screen.getByText('Features')).toBeInTheDocument();
        expect(screen.getByText('Fixes')).toBeInTheDocument();
        expect(
            screen.getByText(/ask for features in chat/i),
        ).toBeInTheDocument();
    });
});
