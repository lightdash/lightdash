// @vitest-environment jsdom
import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { type ComposerLineageTour as ComposerLineageTourComponent } from './ComposerLineageTour';

// Closing hides only the instance that closed, like the real hook before its POST lands.
vi.mock('../../../../../../hooks/useOnboardingTour', async () => {
    const { useState: useHookState } = await import('react');
    return {
        useOnboardingTour: ({ enabled }: { enabled: boolean }) => {
            const [isDismissed, setIsDismissed] = useHookState(false);
            return {
                shouldShow: enabled && !isDismissed,
                closeTour: () => setIsDismissed(true),
                tracking: null,
                isCompleted: false,
            };
        },
    };
});

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

// The tour keeps per-session state at module level; each test gets a fresh copy.
let ComposerLineageTour: typeof ComposerLineageTourComponent;
beforeEach(async () => {
    vi.resetModules();
    ({ ComposerLineageTour } = await import('./ComposerLineageTour'));
});

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
                saveInMenu
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

    it('does not reopen in another panel after it is skipped', async () => {
        const user = userEvent.setup();
        const { rerender } = renderWithProviders(<Panel scopeId="first" />);
        await user.click(screen.getByRole('button', { name: 'Skip' }));
        rerender(
            <>
                <Panel scopeId="first" />
                <Panel scopeId="second" />
            </>,
        );
        expect(screen.queryByText('Step 1 of 4')).not.toBeInTheDocument();
    });

    it('stays open after it switches the panel to Lineage', async () => {
        const user = userEvent.setup();
        renderWithProviders(<Panel scopeId="only" />);
        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    });
});
