// @vitest-environment jsdom
import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ComposerLineageTour } from './ComposerLineageTour';

vi.mock('../../../../../../hooks/useOnboardingTour', () => ({
    useOnboardingTour: () => ({
        shouldShow: true,
        closeTour: vi.fn(),
        tracking: null,
        isCompleted: false,
    }),
}));

const queries: SourceQuery[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'orders',
        title: 'Orders',
        exploreName: 'orders',
        dimensions: [],
        metrics: ['orders_count'],
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'joined',
        title: 'Joined',
        sql: 'SELECT * FROM orders',
        references: ['orders'],
    },
];

const Panel = ({ scopeId }: { scopeId: string }) => (
    <div data-composer-tour-scope={scopeId}>
        <div data-tour="composer-view-toggle" />
        <ComposerLineageTour
            scopeId={scopeId}
            ready
            queries={queries}
            terminalNodeId="joined"
            saveInMenu
            canAddToChat
            onShowLineage={vi.fn()}
        />
    </div>
);

describe('ComposerLineageTour', () => {
    it('runs one tour when a thread shows several eligible panels', () => {
        renderWithProviders(
            <>
                <Panel scopeId="first" />
                <Panel scopeId="second" />
            </>,
        );
        expect(screen.getAllByText('See how this was built')).toHaveLength(1);
    });
});
