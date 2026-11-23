import { type ExternalConnectionTestResponse } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { HUBSPOT_TOKEN_FORM } from './hubspotConnection';
import { TokenLiveSourceModal } from './TokenLiveSourceModal';

const { create, suggestion, tested } = vi.hoisted(() => ({
    create: vi.fn(),
    suggestion: { value: null as string | null },
    tested: { data: undefined as ExternalConnectionTestResponse | undefined },
}));

vi.mock('../hooks/useCreateExternalConnection', () => ({
    useCreateExternalConnection: () => ({
        mutateAsync: create,
        isLoading: false,
    }),
}));

vi.mock('../hooks/useTestConnectionConfig', () => ({
    useTestConnectionConfig: () => ({
        mutate: vi.fn(),
        isLoading: false,
        data: tested.data,
    }),
}));

vi.mock('../hooks/useNewSourceId', async () => {
    const { useState } = await import('react');
    return {
        useNewSourceId: () => {
            const [value, setValue] = useState('hubspot');
            const taken = suggestion.value !== null && value === 'hubspot';
            return {
                value,
                onChange: setValue,
                error: taken ? '"hubspot" is already used' : null,
                suggestion: taken ? suggestion.value : null,
                isBlocked: taken,
            };
        },
    };
});

const renderModal = () =>
    renderWithProviders(
        <TokenLiveSourceModal
            form={HUBSPOT_TOKEN_FORM}
            opened
            onClose={vi.fn()}
            projectUuid="project-1"
            onCreated={vi.fn()}
        />,
    );

describe('TokenLiveSourceModal', () => {
    beforeEach(() => {
        create.mockReset();
        create.mockResolvedValue({ externalConnectionUuid: 'connection-1' });
        suggestion.value = null;
        tested.data = undefined;
    });

    it('shows what the integration says to fix when it rejects the token', () => {
        tested.data = {
            status: 403,
            contentType: 'application/json',
            headers: {},
            body: { code: 'authentication_failed' },
            truncated: false,
            liveCheck: {
                ok: false,
                summary: "Signed in, but this account can't read from HubSpot",
                detail: 'HubSpot rejected the access token. Check its scopes.',
                facts: [],
            },
        };
        renderModal();

        expect(screen.getByRole('status')).toHaveTextContent(
            'HubSpot rejected the access token. Check its scopes.',
        );
        expect(screen.queryByText(/can't read from/)).not.toBeInTheDocument();
    });

    it('creates the source with the explore prefix the admin typed', async () => {
        renderModal();
        const prefix = screen.getByRole('textbox', { name: 'Explore prefix' });
        await userEvent.clear(prefix);
        await userEvent.type(prefix, 'crm');
        await userEvent.type(
            screen.getByLabelText('Access token'),
            'pat-na1-test',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Add source' }),
        );

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-1',
                data: expect.objectContaining({ explorePrefix: 'crm' }),
            }),
        );
    });

    it('offers a free prefix when the one shown is taken', async () => {
        suggestion.value = 'hubspot_2';
        renderModal();
        await userEvent.click(
            screen.getByRole('button', { name: 'hubspot_2' }),
        );

        expect(
            screen.getByRole('textbox', { name: 'Explore prefix' }),
        ).toHaveValue('hubspot_2');
    });
});
