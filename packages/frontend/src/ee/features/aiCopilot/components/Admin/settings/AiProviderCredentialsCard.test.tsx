import { type AiProviderCredentialsList } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiProviderCredentialsCard } from './AiProviderCredentialsCard';

const BEDROCK_MODELS = [
    {
        name: 'claude-sonnet-4-5',
        provider: 'bedrock' as const,
        displayName: 'Claude Sonnet 4.5',
        description: 'Bedrock model',
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        default: false,
        supportsReasoning: true,
        deprecated: false,
        supersededBy: null,
    },
];

const createMutation = vi.fn();
const updateMutation = vi.fn();
const deleteMutation = vi.fn();
const setDefaultMutation = vi.fn();
const replaceMutation = vi.fn();
const adoptLegacyMutation = vi.fn();
let listData: AiProviderCredentialsList = {
    credentials: [],
    legacyBedrock: null,
    unreadableCredentials: [],
};

vi.mock('../../../hooks/useAiProviderCredentials', () => ({
    useAiProviderCredentials: () => ({
        data: listData,
        isInitialLoading: false,
    }),
    useCreateAiProviderCredential: () => ({
        mutate: createMutation,
        isLoading: false,
    }),
    useUpdateAiProviderCredential: () => ({
        mutate: updateMutation,
        isLoading: false,
    }),
    useDeleteAiProviderCredential: () => ({ mutate: deleteMutation }),
    useSetDefaultAiProviderCredential: () => ({ mutate: setDefaultMutation }),
    useReplaceAiProviderCredential: () => ({
        mutate: replaceMutation,
        isLoading: false,
    }),
    useAdoptLegacyAiProviderCredential: () => ({
        mutate: adoptLegacyMutation,
        isLoading: false,
    }),
}));

const TOKYO = {
    uuid: 'cred-tokyo',
    provider: 'bedrock' as const,
    label: 'Japan (Tokyo)',
    region: 'ap-northeast-1',
    allowedModels: ['claude-sonnet-4-5'],
    apiKeyHint: 'ABSK...3f2a',
    isDefault: true,
};

const US = {
    ...TOKYO,
    uuid: 'cred-us',
    label: 'US (Virginia)',
    region: 'us-east-1',
    apiKeyHint: 'ABSK...b71c',
    isDefault: false,
};

const renderCard = (data: Partial<AiProviderCredentialsList> = {}) => {
    listData = {
        credentials: [],
        legacyBedrock: null,
        unreadableCredentials: [],
        ...data,
    };
    return renderWithProviders(
        <AiProviderCredentialsCard models={BEDROCK_MODELS} />,
    );
};

describe('AiProviderCredentialsCard', () => {
    // The mutation mocks are module-level, so they must be reset per test.
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists each credential with its region and marks the default', () => {
        renderCard({ credentials: [TOKYO, US] });

        expect(screen.getByText('Japan (Tokyo)')).toBeInTheDocument();
        expect(screen.getByText('US (Virginia)')).toBeInTheDocument();
        expect(screen.getByText(/ap-northeast-1/)).toBeInTheDocument();
        expect(screen.getByText('default')).toBeInTheDocument();
    });

    // A key hint is safe to render; the key itself must never reach the client.
    it('shows only a key hint, never a key', () => {
        renderCard({ credentials: [TOKYO] });

        expect(screen.getByText(/ABSK\.\.\.3f2a/)).toBeInTheDocument();
    });

    it('saves a new credential with its label, region and models', async () => {
        renderCard();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add credential' }),
        );
        await userEvent.type(
            screen.getByRole('textbox', { name: 'Name' }),
            'Japan (Tokyo)',
        );
        await userEvent.click(
            screen.getByRole('combobox', { name: 'AWS region' }),
        );
        await userEvent.click(
            screen.getByText('Asia Pacific (Tokyo) — ap-northeast-1'),
        );
        await userEvent.type(
            screen.getByLabelText('Bedrock API key', { selector: 'input' }),
            'ABSKsecret',
        );
        await userEvent.click(screen.getByLabelText('Bedrock allowed models'));
        await userEvent.click(screen.getByText('Claude Sonnet 4.5'));
        // Index 1 is the modal's submit; index 0 is the card's trigger.
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add credential' })[1],
        );

        await waitFor(() => {
            expect(createMutation).toHaveBeenCalledWith(
                {
                    provider: 'bedrock',
                    label: 'Japan (Tokyo)',
                    region: 'ap-northeast-1',
                    allowedModels: ['claude-sonnet-4-5'],
                    apiKey: 'ABSKsecret',
                },
                expect.anything(),
            );
        });
    });

    it('reports what is missing instead of saving an incomplete credential', async () => {
        renderCard();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add credential' }),
        );
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add credential' })[1],
        );

        expect(await screen.findByText('Enter a name')).toBeInTheDocument();
        expect(screen.getByText('Select an AWS region')).toBeInTheDocument();
        expect(createMutation).not.toHaveBeenCalled();
    });

    // An omitted key means "keep the stored one", so editing a region must not
    // require re-entering the credential.
    it('keeps the stored key when only the region changes', async () => {
        renderCard({ credentials: [US] });

        await userEvent.click(
            screen.getByRole('button', { name: /Actions for US/ }),
        );
        await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
        await userEvent.click(
            screen.getByRole('combobox', { name: 'AWS region' }),
        );
        await userEvent.click(screen.getByText('US West (Oregon) — us-west-2'));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(updateMutation).toHaveBeenCalledWith(
                {
                    credentialUuid: 'cred-us',
                    data: {
                        label: 'US (Virginia)',
                        region: 'us-west-2',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                },
                expect.anything(),
            );
        });
    });

    // Rendered so an org that configured Bedrock before named credentials does
    // not open the page to an empty list.
    it('renders a legacy Bedrock config as a row', () => {
        renderCard({
            legacyBedrock: {
                region: 'ap-northeast-1',
                allowedModels: ['claude-sonnet-4-5'],
                apiKeyHint: 'ABSK...9ff1',
            },
        });

        expect(
            screen.getByText(/configured before named credentials/),
        ).toBeInTheDocument();
    });

    // The legacy row predates the credentials table, so it has nothing to edit
    // or delete. Without this an org that configured Bedrock before this
    // feature could see its configuration but never change or remove it.
    it('lets a legacy config be converted so it becomes editable', async () => {
        renderCard({
            legacyBedrock: {
                region: 'ap-northeast-1',
                allowedModels: ['claude-sonnet-4-5'],
                apiKeyHint: 'ABSK...9ff1',
            },
        });

        await userEvent.click(
            screen.getByRole('button', {
                name: 'Convert to managed credential',
            }),
        );

        expect(adoptLegacyMutation).toHaveBeenCalled();
    });

    it('offers no conversion once the org manages credentials', () => {
        renderCard({ credentials: [TOKYO] });

        expect(
            screen.queryByRole('button', {
                name: 'Convert to managed credential',
            }),
        ).not.toBeInTheDocument();
    });

    it('warns about credentials that cannot be decrypted', () => {
        renderCard({
            credentials: [TOKYO],
            unreadableCredentials: [{ uuid: 'cred-old', label: 'Old key' }],
        });

        expect(
            screen.getByText(/cannot be read with the current encryption/),
        ).toBeInTheDocument();
        expect(screen.getByText('Old key')).toBeInTheDocument();
    });

    // The warning tells an admin to replace the credential, so the action has
    // to exist — a partial edit cannot repair a row it cannot decrypt.
    it('offers a replace action for an unreadable credential', async () => {
        renderCard({
            unreadableCredentials: [{ uuid: 'cred-old', label: 'Old key' }],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

        expect(
            await screen.findByText(/every field must be re-entered/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Replace credential' }),
        ).toBeInTheDocument();
    });

    it('replaces the whole configuration rather than merging it', async () => {
        renderCard({
            unreadableCredentials: [{ uuid: 'cred-old', label: 'Old key' }],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
        await userEvent.type(
            screen.getByRole('textbox', { name: 'Name' }),
            'Japan (Tokyo)',
        );
        await userEvent.click(
            screen.getByRole('combobox', { name: 'AWS region' }),
        );
        await userEvent.click(
            screen.getByText('Asia Pacific (Tokyo) — ap-northeast-1'),
        );
        await userEvent.type(
            screen.getByLabelText('Bedrock API key', { selector: 'input' }),
            'ABSKnew-key',
        );
        await userEvent.click(screen.getByLabelText('Bedrock allowed models'));
        await userEvent.click(screen.getByText('Claude Sonnet 4.5'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Replace credential' }),
        );

        await waitFor(() => {
            expect(replaceMutation).toHaveBeenCalledWith(
                {
                    credentialUuid: 'cred-old',
                    data: {
                        provider: 'bedrock',
                        label: 'Japan (Tokyo)',
                        region: 'ap-northeast-1',
                        allowedModels: ['claude-sonnet-4-5'],
                        apiKey: 'ABSKnew-key',
                    },
                },
                expect.anything(),
            );
        });
    });

    it('shows an empty state when nothing is configured', () => {
        renderCard();

        expect(
            screen.getByText('No Bedrock credentials yet.'),
        ).toBeInTheDocument();
    });
});
