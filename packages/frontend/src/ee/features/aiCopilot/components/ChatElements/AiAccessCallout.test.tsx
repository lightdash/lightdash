import { subject } from '@casl/ability';
import {
    AGENT_IDENTITY_SETTINGS_PATH,
    AgentCapability,
    AiAccessRefusedError,
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    getAiAccessRefusalSettingsUrl,
    getProjectAgentIdentitySettingsPath,
    type AiAccessRefusal,
    type SdkUiOverrides,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedProviderContext from '../../../../providers/Embed/context';
import { AiAccessCallout } from './AiAccessCallout';
import { AiAccessGate } from './AiAccessGate';
import { getAiAccessRefusal } from './aiAccessRefusal';
const mocks = vi.hoisted(() => ({
    can: vi.fn(),
    popup: vi.fn(),
    login: vi.fn(),
    isLoading: false,
    error: null as Error | null,
}));
vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: {},
        user: {
            data: { organizationUuid: 'org', ability: { can: mocks.can } },
        },
    }),
}));
vi.mock('../../../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { projectUuid: 'project', organizationUuid: 'org' },
    }),
}));
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: (attribution: unknown) => {
        mocks.popup(attribution);
        return {
            mutate: mocks.login,
            isLoading: mocks.isLoading,
            error: mocks.error,
        };
    },
}));
const refusal: AiAccessRefusal = {
    code: 'ai_access_refused',
    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
    message: 'Sign in to run agent queries.',
    action: AiAccessRefusalAction.SIGN_IN,
    settingsUrl: null,
    connectUrl: null,
};
const render = (action: AiAccessRefusal['action']) =>
    renderWithProviders(
        <MemoryRouter>
            <AiAccessCallout
                projectUuid="project"
                refusal={{ ...refusal, action }}
            />
        </MemoryRouter>,
    );
describe('AI access callout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.can.mockReturnValue(false);
        mocks.isLoading = false;
        mocks.error = null;
    });
    it.each(['card', 'inline'] as const)(
        'replaces the composer with the %s callout, then restores it',
        (variant) => {
            const content = (isLoading: boolean, refused: boolean) => (
                <MemoryRouter>
                    <AiAccessGate
                        projectUuid="project"
                        refusal={refused ? refusal : null}
                        isLoading={isLoading}
                        isError={false}
                        refetch={vi.fn()}
                        variant={variant}
                    >
                        <textarea aria-label="Composer" />
                    </AiAccessGate>
                </MemoryRouter>
            );
            const { rerender } = renderWithProviders(content(true, true));
            expect(
                screen.getByTestId('ai-access-placeholder'),
            ).toBeInTheDocument();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Connect agent' }),
            ).not.toBeInTheDocument();
            rerender(content(false, true));
            expect(
                screen.queryByTestId('ai-access-placeholder'),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Connect agent' }),
            ).toBeEnabled();
            expect(!!screen.queryByRole('heading')).toBe(variant === 'card');
            fireEvent.click(
                screen.getByRole('button', { name: 'Connect agent' }),
            );
            expect(mocks.login).toHaveBeenCalledOnce();
            expect(mocks.popup).toHaveBeenLastCalledWith({
                entryPoint: 'chat_card',
                projectUuid: 'project',
            });
            rerender(content(false, false));
            expect(
                screen.getByRole('textbox', { name: 'Composer' }),
            ).toBeEnabled();
            expect(
                screen.queryByRole('button', { name: 'Connect agent' }),
            ).not.toBeInTheDocument();
        },
    );

    it.each(['card', 'inline'] as const)(
        'shows the expired refusal in the %s variant',
        (variant) => {
            const message =
                'Your agent sign-in expired. Connect your agent again.';
            renderWithProviders(
                <MemoryRouter>
                    <AiAccessCallout
                        projectUuid="project"
                        variant={variant}
                        refusal={{
                            ...refusal,
                            reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
                            message,
                        }}
                    />
                </MemoryRouter>,
            );
            expect(screen.getByText(message)).toBeInTheDocument();
            expect(screen.queryByText(/Connect once/)).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Connect agent' }),
            );
            expect(mocks.login).toHaveBeenCalled();
        },
    );
    it('offers agent session sign-in', () => {
        render(AiAccessRefusalAction.SIGN_IN);
        expect(
            screen.getByRole('heading', {
                name: 'Connect your agent to your warehouse',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'My agent identity' }),
        ).toHaveAttribute('href', '/generalSettings/myAgentConnections');
        expect(
            screen.getByText(
                'Connect once so the agent can query Snowflake as you, in a session your warehouse can verify.',
            ),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }));
        expect(mocks.login).toHaveBeenCalled();
    });
    it('disables sign-in while the popup is open', () => {
        mocks.isLoading = true;
        render(AiAccessRefusalAction.SIGN_IN);
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeDisabled();
    });
    it('shows the popup error and allows another attempt', () => {
        mocks.error = new Error('The warehouse rejected this session.');
        render(AiAccessRefusalAction.SIGN_IN);
        expect(screen.getByRole('alert')).toHaveTextContent(
            mocks.error.message,
        );
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
    });
    it('renders a compact inline sign-in action', () => {
        renderWithProviders(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={refusal}
                    variant="inline"
                />
            </MemoryRouter>,
        );
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Connect your agent to your warehouse to run this.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it.each([
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
        AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
        AiAccessRefusalReason.PRINCIPAL_FAILED,
    ])('gates settings for %s at the appropriate scope', (reason) => {
        const settingsUrl =
            '/generalSettings/projectManagement/project/agentIdentity';
        const projectRefusal = {
            ...refusal,
            reason,
            settingsUrl,
            action: AiAccessRefusalAction.ASK_ADMIN,
        };
        mocks.can.mockImplementation(
            (action, resource) =>
                action === 'manage' &&
                resource !== 'Organization' &&
                resource.organizationUuid === 'org' &&
                resource.projectUuid === 'project',
        );
        const { rerender } = renderWithProviders(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={projectRefusal}
                />
            </MemoryRouter>,
        );
        if (reason === AiAccessRefusalReason.PRINCIPAL_FAILED) {
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        } else {
            expect(
                screen.getByRole('link', {
                    name: 'Open project agent settings',
                }),
            ).toHaveAttribute('href', settingsUrl);
        }
        mocks.can.mockReturnValue(false);
        rerender(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={projectRefusal}
                />
            </MemoryRouter>,
        );
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        mocks.can.mockImplementation(
            (_action, resource) => resource === 'Organization',
        );
        rerender(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={{
                        ...projectRefusal,
                        reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                        settingsUrl: '/custom-org-settings',
                    }}
                />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('link', { name: 'Review agent identity' }),
        ).toHaveAttribute('href', '/custom-org-settings');
    });

    it.each([
        { target: 'project', absolute: true },
        { target: 'other-project', absolute: false },
        { target: 'other-project', absolute: true },
    ])(
        'uses the target project for raw SQL settings ($target, absolute: $absolute)',
        ({ target, absolute }) => {
            const settingsPath = getProjectAgentIdentitySettingsPath(target);
            const projectRefusal: AiAccessRefusal = {
                ...refusal,
                reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
                action: AiAccessRefusalAction.ASK_ADMIN,
                projectUuid: target,
                settingsUrl: absolute
                    ? new URL(settingsPath, window.location.origin).href
                    : settingsPath,
            };
            mocks.can.mockImplementation(
                (action, resource) =>
                    action === 'manage' &&
                    resource !== 'Organization' &&
                    resource.organizationUuid === 'org' &&
                    resource.projectUuid === target,
            );
            const { rerender } = renderWithProviders(
                <MemoryRouter>
                    <AiAccessCallout
                        projectUuid="project"
                        refusal={projectRefusal}
                    />
                </MemoryRouter>,
            );
            expect(
                screen.getByRole('link', {
                    name: 'Open project agent settings',
                }),
            ).toHaveAttribute('href', settingsPath);
            expect(mocks.can).toHaveBeenLastCalledWith(
                'manage',
                subject('Project', {
                    organizationUuid: 'org',
                    projectUuid: target,
                }),
            );

            mocks.can.mockImplementation(
                (action, resource) =>
                    action === 'manage' &&
                    resource !== 'Organization' &&
                    resource.projectUuid === 'project' &&
                    resource.projectUuid !== target,
            );
            rerender(
                <MemoryRouter>
                    <AiAccessCallout
                        projectUuid="project"
                        refusal={projectRefusal}
                    />
                </MemoryRouter>,
            );
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(mocks.can).toHaveBeenLastCalledWith(
                'manage',
                subject('Project', {
                    organizationUuid: 'org',
                    projectUuid: target,
                }),
            );
        },
    );

    it('does not treat a foreign-origin settings URL as a project link', () => {
        mocks.can.mockImplementation(
            (action, resource) =>
                action === 'manage' && resource === 'Organization',
        );
        renderWithProviders(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={{
                        ...refusal,
                        reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
                        action: AiAccessRefusalAction.ASK_ADMIN,
                        projectUuid: 'project',
                        settingsUrl: `https://other.example${getProjectAgentIdentitySettingsPath('project')}`,
                    }}
                />
            </MemoryRouter>,
        );
        expect(mocks.can).toHaveBeenLastCalledWith('manage', 'Organization');
        expect(
            screen.getByRole('link', { name: 'Review agent identity' }),
        ).toHaveAttribute(
            'href',
            'https://other.example/generalSettings/projectManagement/project/agentIdentity',
        );
        expect(
            screen.queryByRole('link', { name: 'Open project agent settings' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
        AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
    ])(
        'requires organization manage for %s with organization settings',
        (reason) => {
            const orgRefusal: AiAccessRefusal = {
                ...refusal,
                reason,
                action: AiAccessRefusalAction.ASK_ADMIN,
                settingsUrl: getAiAccessRefusalSettingsUrl(reason, null),
            };
            mocks.can.mockImplementation(
                (action, resource) =>
                    action === 'manage' &&
                    resource !== 'Organization' &&
                    resource.organizationUuid === 'org' &&
                    resource.projectUuid === 'project',
            );
            const content = (
                <MemoryRouter>
                    <AiAccessCallout
                        projectUuid="project"
                        refusal={orgRefusal}
                    />
                </MemoryRouter>
            );
            const { rerender } = renderWithProviders(content);
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(mocks.can).toHaveBeenLastCalledWith(
                'manage',
                'Organization',
            );

            mocks.can.mockImplementation(
                (action, resource) =>
                    action === 'manage' && resource === 'Organization',
            );
            rerender(
                <MemoryRouter>
                    <AiAccessCallout
                        projectUuid="project"
                        refusal={orgRefusal}
                    />
                </MemoryRouter>,
            );
            expect(
                screen.getByRole('link', { name: 'Review agent identity' }),
            ).toHaveAttribute('href', AGENT_IDENTITY_SETTINGS_PATH);
            expect(mocks.can).toHaveBeenLastCalledWith(
                'manage',
                'Organization',
            );
        },
    );

    it('links organization managers to warehouse credential settings', () => {
        mocks.can.mockReturnValue(true);
        render(AiAccessRefusalAction.ASK_ADMIN);
        expect(
            screen.getByRole('link', { name: 'Review agent identity' }),
        ).toHaveAttribute('href', '/generalSettings/agentIdentity');
        expect(mocks.can).toHaveBeenCalledWith('manage', 'Organization');
    });
    it('does not link other users to settings', () => {
        render(AiAccessRefusalAction.ASK_ADMIN);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('shows only the message when there is no action', () => {
        mocks.can.mockReturnValue(true);
        render(null);
        expect(screen.getByText(refusal.message)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('extracts a structured tool refusal without parsing ordinary tool errors', () => {
        expect(getAiAccessRefusal({ structuredContent: { refusal } })).toEqual(
            refusal,
        );
        expect(
            getAiAccessRefusal({ structuredContent: { refusal: null } }),
        ).toBeNull();
        expect(getAiAccessRefusal({ result: 'failed' })).toBeNull();
    });
    it.each([
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
    ])('shows the backend message for %s without sign-in', (reason) => {
        const message =
            'Ask an administrator to add or replace the shared agent account.';
        renderWithProviders(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={{
                        ...refusal,
                        reason,
                        action: AiAccessRefusalAction.ASK_ADMIN,
                        message,
                    }}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText(message)).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Connect agent' }),
        ).not.toBeInTheDocument();
    });
});

it('shows other blockers and See why to the person, including structured extraction', () => {
    const { refusal: detailedRefusal } = new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        {
            capability: AgentCapability.ContentWrite,
            policyLayer: 'org_ceiling',
            requiredCapabilities: [
                AgentCapability.ContentWrite,
                AgentCapability.Publish,
            ],
            blockersComplete: true,
            explanationUrl: '/generalSettings/myAgentConnections',
            blockers: [
                {
                    checkId: 'capability:content_write',
                    status: 'refused',
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    capability: AgentCapability.ContentWrite,
                    policyLayer: 'org_ceiling',
                    message: 'Primary',
                    settingsUrl: null,
                },
                {
                    checkId: 'capability:publish',
                    status: 'refused',
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    capability: AgentCapability.Publish,
                    policyLayer: 'org_ceiling',
                    message: 'Secondary',
                    settingsUrl: null,
                },
            ],
        },
    );
    const parsed = getAiAccessRefusal({
        structuredContent: { refusal: detailedRefusal },
    });
    expect(parsed).toEqual(detailedRefusal);
    renderWithProviders(
        <MemoryRouter>
            <AiAccessCallout projectUuid="project" refusal={parsed!} />
        </MemoryRouter>,
    );
    expect(screen.getByText(detailedRefusal.message)).toBeInTheDocument();
    expect(
        screen.getByText('Also needed: Publish and share'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See why' })).toHaveAttribute(
        'href',
        '/generalSettings/myAgentConnections',
    );
});

const managedRefusal: AiAccessRefusal = new AiAccessRefusedError(
    AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    {
        capability: AgentCapability.ContentWrite,
        policyLayer: 'org_ceiling',
        blockers: [
            {
                checkId: 'capability:content_write',
                status: 'refused',
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.ContentWrite,
                policyLayer: 'org_ceiling',
                message: 'Primary',
                settingsUrl: null,
            },
            {
                checkId: 'capability:publish',
                status: 'refused',
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                capability: AgentCapability.Publish,
                policyLayer: 'org_ceiling',
                message: 'Secondary',
                settingsUrl: null,
            },
            {
                checkId: 'warehouse_confirmation',
                status: 'setup_needed',
                reason: AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
                capability: AgentCapability.RawSql,
                policyLayer: 'warehouse_identity',
                message: 'Confirm warehouse',
                settingsUrl: null,
            },
        ],
    },
).refusal;

it.each(['direct', 'sdk', 'main'] as const)(
    'keeps requirements and gates explanation links in the %s context',
    (context) => {
        const content = (explanationUrl: string) => (
            <MemoryRouter>
                <EmbedProviderContext.Consumer>
                    {(defaults) => (
                        <EmbedProviderContext.Provider
                            value={{
                                ...defaults,
                                mode: context === 'sdk' ? 'sdk' : 'direct',
                                embedToken:
                                    context === 'main'
                                        ? undefined
                                        : 'embed-token',
                            }}
                        >
                            <AiAccessCallout
                                projectUuid="project"
                                refusal={{ ...managedRefusal, explanationUrl }}
                            />
                        </EmbedProviderContext.Provider>
                    )}
                </EmbedProviderContext.Consumer>
            </MemoryRouter>
        );
        const personalUrl = '/generalSettings/myAgentConnections';
        const { rerender } = renderWithProviders(content(personalUrl));
        for (const url of [
            personalUrl,
            '/generalSettings/agentIdentity#test-agent-access',
        ]) {
            rerender(content(url));
            expect(
                screen.getByText(managedRefusal.message),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'Also needed: Publish and share, warehouse confirmation for this project',
                ),
            ).toBeInTheDocument();
            if (context === 'main') {
                expect(
                    screen.getByRole('link', { name: 'See why' }),
                ).toHaveAttribute('href', url);
            } else {
                expect(
                    screen.queryByRole('link', { name: 'See why' }),
                ).not.toBeInTheDocument();
            }
        }
    },
);

it('uses embed UI overrides for capability and setting requirement labels', () => {
    const overrides: SdkUiOverrides = {
        'aiAccess.alsoNeeded': 'También se necesita: {requirements}',
        'aiAccess.requirements.capabilities.publish': 'Publicar y compartir',
        'aiAccess.requirements.warehouseConfirmation':
            'confirmación del almacén para este proyecto',
    };
    renderWithProviders(
        <MemoryRouter>
            <EmbedProviderContext.Consumer>
                {(defaults) => (
                    <EmbedProviderContext.Provider
                        value={{
                            ...defaults,
                            embedToken: 'embed-token',
                            mode: 'sdk',
                            t: (key) => overrides[key],
                        }}
                    >
                        <AiAccessCallout
                            projectUuid="project"
                            refusal={managedRefusal}
                        />
                    </EmbedProviderContext.Provider>
                )}
            </EmbedProviderContext.Consumer>
        </MemoryRouter>,
    );
    expect(
        screen.getByText(
            'También se necesita: Publicar y compartir, confirmación del almacén para este proyecto',
        ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Publish and share/)).not.toBeInTheDocument();
    expect(
        screen.queryByText(/warehouse confirmation for this project/),
    ).not.toBeInTheDocument();
});
