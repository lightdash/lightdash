import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { HUBSPOT_TOKEN_FORM } from './hubspotConnection';
import { TokenLiveSourceModal } from './TokenLiveSourceModal';

const { create, suggestion } = vi.hoisted(() => ({
    create: vi.fn(),
    suggestion: { value: null as string | null },
}));

vi.mock('../hooks/useCreateExternalConnection', () => ({
    useCreateExternalConnection: () => ({
        mutateAsync: create,
        isLoading: false,
    }),
}));

vi.mock('../hooks/useTestConnectionConfig', () => ({
    useTestConnectionConfig: () => ({ mutate: vi.fn(), isLoading: false }),
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
