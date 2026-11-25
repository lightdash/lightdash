// @vitest-environment jsdom
import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ComposerLineageTour } from './ComposerLineageTour';

vi.mock('../../../../../../hooks/useOnboardingTour', () => ({
    useOnboardingTour: ({ enabled }: { enabled: boolean }) => ({
        shouldShow: enabled,
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

// Eligible only in Chart view, like the artifact panel.
const Panel = ({ scopeId }: { scopeId: string }) => {
    const [isLineage, setIsLineage] = useState(false);
    return (
        <div data-composer-tour-scope={scopeId}>
            <div data-tour="composer-view-toggle" />
            <ComposerLineageTour
                scopeId={scopeId}
                ready={!isLineage}
                queries={queries}
                terminalNodeId="joined"
                save="menu"
                canAddToChat
                onShowLineage={setIsLineage}
            />
        </div>
    );
};

describe('ComposerLineageTour', () => {
    it('runs one tour when a thread shows several eligible panels', () => {
        renderWithProviders(
            <>
                <Panel scopeId="first" />
                <Panel scopeId="second" />
            </>,
        );
        expect(screen.getAllByText('Step 1 of 4')).toHaveLength(1);
    });

    it('stays open after it switches the panel to Lineage', async () => {
        const user = userEvent.setup();
        renderWithProviders(<Panel scopeId="only" />);
        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    });
});
