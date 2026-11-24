import { type SemanticStudioRejection } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { listProposalIssues } from './proposalIssues';
import { fixFailureAction } from './turnActions';
import { TurnCard } from './TurnCard';

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
