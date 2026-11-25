import { type SemanticStudioRejection } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { listProposalIssues } from './proposalIssues';
import { fixFailureAction } from './turnActions';
import { TurnCard, type TurnRow } from './TurnCard';

const renderRejected = (
    rejection: SemanticStudioRejection,
    onAsk: (message: string) => void,
) => {
    const issues = listProposalIssues({
        models: [
            {
                model: 'orders',
                status: 'failed',
                changes: [],
                refusals: [],
                error: 'The raw error',
                rejection,
            },
        ],
    });
    return renderWithProviders(
        <MemoryRouter>
            <TurnCard
                icon={null}
                status="Draft"
                headerAction={null}
                groups={[
                    {
                        model: 'orders',
                        change: 'changed',
                        title: 'Orders',
                        subtitle: null,
                        rows: [],
                        issues,
                    },
                ]}
                safety={null}
                isLatest
                actions={[fixFailureAction(issues, onAsk)]}
                isGone={false}
            />
        </MemoryRouter>,
    );
};

describe('a model the check left out', () => {
    it('says why in a sentence, keeps the raw error behind Details, and offers the agent a fix', () => {
        const onAsk = vi.fn();
        renderRejected(
            {
                kind: 'warehouse_refused',
                detail: '[ERROR_CODE] cannot read column_a',
            },
            onAsk,
        );
        expect(
            screen.getByText(
                /The warehouse refused orders when it was checked/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('[ERROR_CODE] cannot read column_a'),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Details' }));
        expect(
            screen.getByText('[ERROR_CODE] cannot read column_a'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Fix with agent' }));
        expect(onAsk).toHaveBeenCalledWith(
            'orders was not added: The warehouse refused orders when it was checked. [ERROR_CODE] cannot read column_a Fix it.',
        );
    });

    it('offers no fix for a model that was already failing', () => {
        renderRejected(
            { kind: 'already_failing', detail: 'cannot read column_a' },
            vi.fn(),
        );
        expect(
            screen.getByText(/orders was already failing the warehouse check/),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        expect(
            screen.queryByRole('button', { name: 'Fix with agent' }),
        ).not.toBeInTheDocument();
    });

    it('offers no fix for a change to who can see a field', () => {
        renderRejected(
            {
                kind: 'access_change',
                fields: ['dimensions.id'],
                detail: null,
            },
            vi.fn(),
        );
        expect(
            screen.getByText(/This would change who can see dimensions.id/),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Details' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Fix with agent' }),
        ).not.toBeInTheDocument();
    });
});

const ACTIONS = {
    new: 'Added the',
    changed: 'Changed the',
    removed: 'Removed the',
};

const rowsOf = (
    kind: TurnRow['kind'],
    change: TurnRow['change'],
    names: string[],
): TurnRow[] =>
    names.map((name) => ({
        id: `${kind}:${name}`,
        kind,
        change,
        action: `${ACTIONS[change]} ${kind}`,
        icon: null,
        label: name,
        detail: null,
        title: name,
        to: '/',
        onOpen: null,
    }));

const names = (prefix: string, amount: number) =>
    Array.from({ length: amount }, (_, i) => `${prefix}_${i + 1}`);

const renderRows = (rows: TurnRow[]) =>
    renderWithProviders(
        <MemoryRouter>
            <TurnCard
                icon={null}
                status="Drafted"
                headerAction={null}
                groups={[
                    {
                        model: 'orders',
                        change: 'changed',
                        title: 'Orders',
                        subtitle: null,
                        rows,
                        issues: [],
                    },
                ]}
                safety={null}
                isLatest
                actions={[]}
                isGone={false}
            />
        </MemoryRouter>,
    );

describe('a long change', () => {
    const rows = [
        ...rowsOf('dimension', 'new', names('sales_region', 3)),
        ...rowsOf('metric', 'new', names('revenue', 2)),
        ...rowsOf('dimension', 'changed', names('status', 4)),
        {
            ...rowsOf('model', 'changed', ['model'])[0],
            action: 'Changed',
            label: 'its description',
        },
        ...rowsOf('metric', 'removed', ['total_amount']),
    ];

    it('folds to a grouped summary, and keeps removals named', () => {
        renderRows(rows);
        expect(
            screen.getByText(
                'Added 3 dimensions and 2 metrics · changed 4 dimensions and its description · removed 1 metric',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Removed the metric total_amount'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Added the dimension sales_region_1'),
        ).not.toBeInTheDocument();
    });

    it('expands to the changes grouped by what was done and to what', () => {
        renderRows(rows);
        fireEvent.click(
            screen.getByRole('button', { name: 'Show all 11 changes' }),
        );
        expect(screen.getByText('Added 3 dimensions')).toBeInTheDocument();
        expect(screen.getByText('Added 2 metrics')).toBeInTheDocument();
        expect(screen.getByText('Changed 4 dimensions')).toBeInTheDocument();
        expect(screen.getByText('Changed its description')).toBeInTheDocument();
        expect(screen.getByText('Removed 1 metric')).toBeInTheDocument();
        expect(screen.getByText('sales_region_1')).toBeInTheDocument();
        expect(screen.getByText('total_amount')).toBeInTheDocument();
    });
});

describe('a short change', () => {
    it('lists each change as a sentence, as before', () => {
        renderRows([
            ...rowsOf('dimension', 'new', ['sales_region']),
            ...rowsOf('metric', 'removed', ['revenue']),
        ]);
        expect(
            screen.getByText('Added the dimension sales_region'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Removed the metric revenue'),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    });
});
