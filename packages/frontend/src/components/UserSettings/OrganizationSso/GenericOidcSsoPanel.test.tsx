import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVerifiedDomains } from '../../../hooks/organization/useOrganizationDomainVerification';
import {
    useDeleteGenericOidcSsoConfig,
    useGenericOidcSsoConfig,
    useUpsertGenericOidcSsoConfig,
} from '../../../hooks/organization/useOrganizationSso';
import { renderWithProviders } from '../../../testing/testUtils';
import GenericOidcSsoPanel from './GenericOidcSsoPanel';

vi.mock('../../../hooks/organization/useOrganizationSso', () => ({
    useGenericOidcSsoConfig: vi.fn(),
    useUpsertGenericOidcSsoConfig: vi.fn(),
    useDeleteGenericOidcSsoConfig: vi.fn(),
}));

vi.mock(
    '../../../hooks/organization/useOrganizationDomainVerification',
    () => ({
        useVerifiedDomains: vi.fn(),
    }),
);

// FormSection wraps the form in a Mantine Collapse whose open animation never
// settles in jsdom, hiding the content from role queries. Render children
// directly so we can exercise the form itself.
vi.mock('../../ProjectConnection/Inputs/FormSection', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockUseConfig = vi.mocked(useGenericOidcSsoConfig);
const mockUseUpsert = vi.mocked(useUpsertGenericOidcSsoConfig);
const mockUseDelete = vi.mocked(useDeleteGenericOidcSsoConfig);
const mockUseVerifiedDomains = vi.mocked(useVerifiedDomains);

const existingConfig = {
    clientId: 'existing-client-id',
    metadataDocumentEndpoint:
        'https://idp.example.com/.well-known/openid-configuration',
    scopes: null,
    hasClientSecret: true,
    enabled: true,
    overrideEmailDomains: false,
    emailDomains: [],
    allowPassword: true,
};

let mutate: ReturnType<typeof vi.fn>;

const renderPanel = () =>
    renderWithProviders(
        <MemoryRouter>
            <GenericOidcSsoPanel />
        </MemoryRouter>,
    );

// userEvent.click on the submit button doesn't reliably trigger implicit form
// submission under jsdom; submit the form element directly instead.
const submitForm = () => fireEvent.submit(document.querySelector('form')!);

beforeEach(() => {
    mutate = vi.fn();
    mockUseUpsert.mockReturnValue({
        mutate,
        isLoading: false,
    } as unknown as ReturnType<typeof useUpsertGenericOidcSsoConfig>);
    mockUseDelete.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isLoading: false,
    } as unknown as ReturnType<typeof useDeleteGenericOidcSsoConfig>);
    mockUseVerifiedDomains.mockReturnValue({
        data: [],
        isInitialLoading: false,
    } as unknown as ReturnType<typeof useVerifiedDomains>);
});

describe('GenericOidcSsoPanel form validation', () => {
    it('blocks submission and shows errors when required fields are empty', async () => {
        mockUseConfig.mockReturnValue({
            data: undefined,
            isLoading: false,
        } as unknown as ReturnType<typeof useGenericOidcSsoConfig>);

        renderPanel();
        submitForm();

        expect(
            await screen.findByText('Discovery document URL is required'),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('Client ID is required'),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('Client secret is required'),
        ).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
    });

    it('requires at least one domain when override is enabled', async () => {
        const user = userEvent.setup();
        mockUseConfig.mockReturnValue({
            data: undefined,
            isLoading: false,
        } as unknown as ReturnType<typeof useGenericOidcSsoConfig>);
        mockUseVerifiedDomains.mockReturnValue({
            data: [{ domain: 'acme.com' }],
            isInitialLoading: false,
        } as unknown as ReturnType<typeof useVerifiedDomains>);

        renderPanel();

        await user.click(
            screen.getByRole('checkbox', {
                name: /Restrict to specific verified domains/,
            }),
        );
        submitForm();

        expect(
            await screen.findByText(
                'Add at least one domain when override is enabled',
            ),
        ).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
    });

    it('does not require a client secret when editing an existing configuration', async () => {
        mockUseConfig.mockReturnValue({
            data: existingConfig,
            isLoading: false,
        } as unknown as ReturnType<typeof useGenericOidcSsoConfig>);

        renderPanel();
        submitForm();

        // Prefilled required fields + existing secret means validation passes
        // and the upsert fires without a re-entered secret.
        await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
        expect(
            screen.queryByText('Client secret is required'),
        ).not.toBeInTheDocument();
    });
});
