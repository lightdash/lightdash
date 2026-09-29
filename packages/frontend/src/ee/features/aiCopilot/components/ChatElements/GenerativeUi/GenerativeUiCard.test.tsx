import {
    deleteWithConfirmSpecMock,
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    generativeUiOperationsMock,
    invalidSpecMock,
    moveChartsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { GenerativeUiCard } from './GenerativeUiCard';
import { type GenerativeUiRequest } from './requests';

const PROJECT = GENERATIVE_UI_PROJECT_UUID_MOCK;

const SPACES = [
    { uuid: 'space-finance', name: 'Finance' },
    { uuid: 'space-sales', name: 'Sales' },
];

const CHARTS = [
    { uuid: 'chart-revenue', name: 'Revenue by month', spaceName: 'Sales' },
    { uuid: 'chart-orders', name: 'Orders by week', spaceName: 'Sales' },
];

const fakeFetcher = () =>
    vi.fn(async (request: GenerativeUiRequest) => {
        if (request.method !== 'GET') return null;
        if (request.url.endsWith('/spaces')) return SPACES;
        if (request.url.endsWith('/chart-summaries')) return CHARTS;
        return [];
    });

const renderCard = (
    toolArgs: unknown,
    fetcher: ReturnType<typeof fakeFetcher>,
    onSubmit = vi.fn().mockResolvedValue(undefined),
) => {
    renderWithProviders(
        <GenerativeUiCard
            toolCallId="tool-call-1"
            projectUuid={PROJECT}
            toolArgs={toolArgs}
            operations={generativeUiOperationsMock}
            fetcher={fetcher}
            onSubmit={onSubmit}
        />,
    );
    return { onSubmit };
};

const chooseOption = async (label: string, option: string) => {
    const user = userEvent.setup();
    // Required fields append an asterisk to the label.
    const inputs = await screen.findAllByLabelText(new RegExp(`^${label}`));
    const input = inputs.find(
        (element) =>
            element instanceof HTMLInputElement && element.type !== 'hidden',
    );
    if (input === undefined) throw new Error(`No visible input for ${label}`);
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: option }));
};

const writes = (fetcher: ReturnType<typeof fakeFetcher>) =>
    fetcher.mock.calls
        .map(([request]) => request)
        .filter((request) => request.method !== 'GET');

describe('GenerativeUiCard', () => {
    it('lists every problem when the spec cannot be shown', () => {
        renderCard(invalidSpecMock, fakeFetcher());

        expect(
            screen.getByText('This card could not be shown'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/"updateSavedChart" is not an operation/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/projectUuid is filled in from the conversation/),
        ).toBeInTheDocument();
    });

    it('runs the action with the chosen values and submits the outcome', async () => {
        const user = userEvent.setup();
        const fetcher = fakeFetcher();
        const { onSubmit } = renderCard(moveChartsSpecMock, fetcher);

        await chooseOption('Target space', 'Finance');
        await user.click(
            await screen.findByRole('checkbox', {
                name: 'Select Revenue by month',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Move charts' }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                status: 'success',
                state: {
                    spaceUuid: 'space-finance',
                    chartUuids: ['chart-revenue'],
                },
                responses: { move: [null] },
            }),
        );
        expect(writes(fetcher)).toEqual([
            {
                method: 'POST',
                version: 'v2',
                url: `/content/${PROJECT}/move`,
                body: JSON.stringify({
                    action: { type: 'move', targetSpaceUuid: 'space-finance' },
                    item: {
                        contentType: 'chart',
                        source: 'dbt_explore',
                        uuid: 'chart-revenue',
                    },
                }),
            },
        ]);
        expect(await screen.findByText('Charts moved.')).toBeInTheDocument();
        expect(screen.getByText('Sent to the agent.')).toBeInTheDocument();
    });

    it('does not run until required inputs are filled', async () => {
        const user = userEvent.setup();
        const fetcher = fakeFetcher();
        const { onSubmit } = renderCard(moveChartsSpecMock, fetcher);

        await screen.findByRole('checkbox', {
            name: 'Select Revenue by month',
        });
        await user.click(screen.getByRole('button', { name: 'Move charts' }));

        expect(await screen.findByText('Required')).toBeInTheDocument();
        expect(screen.getByText('Select at least one')).toBeInTheDocument();
        expect(writes(fetcher)).toEqual([]);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits a skipped card as dismissed without running anything', async () => {
        const user = userEvent.setup();
        const fetcher = fakeFetcher();
        const { onSubmit } = renderCard(moveChartsSpecMock, fetcher);

        await user.click(screen.getByRole('button', { name: 'Skip' }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                status: 'dismissed',
                state: { spaceUuid: null, chartUuids: [] },
            }),
        );
        expect(writes(fetcher)).toEqual([]);
    });

    it('asks for confirmation before a DELETE step', async () => {
        const user = userEvent.setup();
        const fetcher = fakeFetcher();
        const { onSubmit } = renderCard(deleteWithConfirmSpecMock, fetcher);

        await chooseOption('Space', 'Sales');
        await user.click(screen.getByRole('button', { name: 'Delete space' }));

        expect(
            screen.getByText('Delete this space and everything in it?'),
        ).toBeInTheDocument();
        expect(writes(fetcher)).toEqual([]);

        await user.click(screen.getByRole('button', { name: 'Confirm' }));

        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                status: 'success',
                state: { spaceUuid: 'space-sales' },
                responses: { deleteSpace: [null] },
            }),
        );
        expect(writes(fetcher)).toEqual([
            {
                method: 'DELETE',
                version: 'v1',
                url: `/projects/${PROJECT}/spaces/space-sales`,
                body: undefined,
            },
        ]);
    });

    it('offers to send again when the outcome cannot be delivered', async () => {
        const user = userEvent.setup();
        const onSubmit = vi
            .fn()
            .mockRejectedValueOnce(new Error('Offline'))
            .mockResolvedValueOnce(undefined);
        renderCard(moveChartsSpecMock, fakeFetcher(), onSubmit);

        await user.click(screen.getByRole('button', { name: 'Skip' }));
        await user.click(
            await screen.findByRole('button', { name: 'Send again' }),
        );

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
        expect(
            await screen.findByText('Sent to the agent.'),
        ).toBeInTheDocument();
    });
});
