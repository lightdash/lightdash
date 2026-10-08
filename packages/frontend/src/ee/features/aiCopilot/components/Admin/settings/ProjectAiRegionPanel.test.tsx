import { type AiProviderCredentialsList } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ProjectAiRegionPanel } from './ProjectAiRegionPanel';

const setMutation = vi.fn();
let listData: AiProviderCredentialsList = {
    credentials: [],
    legacyBedrock: null,
    unreadableCredentials: [],
};
let storedCredentialUuid: string | null = null;
let customProvidersEnabled = true;

vi.mock('../../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isSuccess: true,
        isInitialLoading: false,
        data: { enabled: customProvidersEnabled },
    }),
}));

vi.mock('../../../hooks/useAiProviderCredentials', () => ({
    useAiProviderCredentials: () => ({
        data: listData,
        isInitialLoading: false,
    }),
}));

vi.mock('../../../hooks/useProjectAiProviderCredential', () => ({
    useProjectAiProviderCredential: () => ({
        data: { credentialUuid: storedCredentialUuid },
        isInitialLoading: false,
    }),
    useSetProjectAiProviderCredential: () => ({
        mutate: setMutation,
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
    isDefault: false,
};

const renderPanel = ({
    credentials = [TOKYO, US],
    stored = null,
    flagEnabled = true,
}: {
    credentials?: AiProviderCredentialsList['credentials'];
    stored?: string | null;
    flagEnabled?: boolean;
} = {}) => {
    listData = {
        credentials,
        legacyBedrock: null,
        unreadableCredentials: [],
    };
    storedCredentialUuid = stored;
    customProvidersEnabled = flagEnabled;
    return renderWithProviders(
        <ProjectAiRegionPanel projectUuid="project-1" />,
    );
};

describe('ProjectAiRegionPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('names the organization default so the inherited region is visible', () => {
        renderPanel();

        expect(
            screen.getByDisplayValue(
                'Organization default — Japan (Tokyo) (ap-northeast-1)',
            ),
        ).toBeInTheDocument();
    });

    it('pins the project to the chosen credential', async () => {
        renderPanel();

        await userEvent.click(
            screen.getByRole('combobox', { name: 'AI provider credential' }),
        );
        await userEvent.click(screen.getByText('US (Virginia) — us-east-1'));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(setMutation).toHaveBeenCalledWith('cred-us');
        });
    });

    // Null clears the pin, which is different from picking the credential that
    // currently happens to be the default.
    it('clears the pin when switching back to the organization default', async () => {
        renderPanel({ stored: 'cred-us' });

        await userEvent.click(
            screen.getByRole('combobox', { name: 'AI provider credential' }),
        );
        await userEvent.click(
            screen.getByText(
                'Organization default — Japan (Tokyo) (ap-northeast-1)',
            ),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(setMutation).toHaveBeenCalledWith(null);
        });
    });

    it('does not offer a save until something changes', () => {
        renderPanel();

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    // The limit of project-level pinning must be stated where it is chosen —
    // and must not name paths that are in fact project-scoped.
    it('names Slack routing as the one path it cannot cover', () => {
        renderPanel();

        expect(
            screen.getByText(/cannot cover Slack agent\s+routing/),
        ).toBeInTheDocument();
    });

    it('does not claim thread titles use the organization default', () => {
        renderPanel();

        expect(screen.queryByText(/thread titles/)).not.toBeInTheDocument();
    });

    it('points admins at organization settings when nothing is configured', () => {
        renderPanel({ credentials: [] });

        expect(
            screen.getByText(/No AI provider credentials are configured/),
        ).toBeInTheDocument();
    });

    // The backend rejects pin writes while the flag is off, so the selector
    // must not be offered at all without a stored pin.
    it('hides the selector while custom providers are disabled and no pin is stored', () => {
        renderPanel({ flagEnabled: false });

        expect(
            screen.getByText(/Custom AI providers are not enabled/),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('combobox', { name: 'AI provider credential' }),
        ).not.toBeInTheDocument();
    });

    // A pin stored before the flag was turned off is failing the project's AI
    // requests — the screen must say so and still offer a way to clear it.
    it('keeps the selector and warns when a pin is stored while disabled', async () => {
        renderPanel({ stored: 'cred-us', flagEnabled: false });

        expect(
            screen.getByText(/pinned credential is\s+not being served/),
        ).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('combobox', { name: 'AI provider credential' }),
        );
        await userEvent.click(
            screen.getByText(
                'Organization default — Japan (Tokyo) (ap-northeast-1)',
            ),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(setMutation).toHaveBeenCalledWith(null);
        });
    });

    // Only clearing is possible while the flag is off; re-pinning would be
    // rejected by the backend.
    it('disables credential options while custom providers are disabled', async () => {
        renderPanel({ stored: 'cred-us', flagEnabled: false });

        await userEvent.click(
            screen.getByRole('combobox', { name: 'AI provider credential' }),
        );

        expect(
            screen.getByRole('option', {
                name: 'Japan (Tokyo) — ap-northeast-1',
            }),
        ).toHaveAttribute('data-combobox-disabled', 'true');
    });
});
