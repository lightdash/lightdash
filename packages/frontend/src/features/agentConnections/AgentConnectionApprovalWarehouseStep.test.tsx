import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    WarehouseTypes,
    type AiAccessForUser,
    type AgentConnectionApprovalProject,
} from '@lightdash/common';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { ApprovalCompletion } from './ApprovalCompletion';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
const login = vi.hoisted(() => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isLoading: false,
    error: null,
}));
vi.mock('../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => login,
    SnowflakeSignInPopupBlockedError: class extends Error {},
}));
const project: AgentConnectionApprovalProject = {
    projectUuid: 'project',
    name: 'Development',
    selectable: true,
    reason: null,
    capabilities: [],
};
const ready = (): AiAccessForUser => ({
    requirementSource: 'organization',
    identity: 'connected_person',
    source: 'agent_sign_in',
    marker: null,
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    enabled: true,
    principalKind: 'person',
    refusal: null,
    expiresAt: null,
    principalName: 'Agent',
});
const refused = (
    reason: AiAccessRefusalReason,
    action: AiAccessRefusalAction,
): AiAccessForUser => ({
    ...ready(),
    identity: null,
    refusal: {
        code: 'ai_access_refused',
        reason,
        action,
        message: 'Server warehouse explanation.',
        settingsUrl: null,
        connectUrl: null,
    },
});
const api = vi.mocked(lightdashApi);
let access = ready();
let multi = false;
let enumerationError = false;
let accessError = false;
const reviewOnly = 'Review only. No connection will be created.';
const renderStep = (projects = [project], notice: string | null = reviewOnly) =>
    renderWithProviders(
        <MemoryRouter>
            <ApprovalCompletion
                completion={{
                    decision: 'approve',
                    completionUrl: 'http://localhost/completion',
                    attempted: true,
                    projects,
                    notice,
                }}
            />
        </MemoryRouter>,
    );
beforeEach(() => {
    vi.clearAllMocks();
    access = ready();
    multi = false;
    enumerationError = false;
    accessError = false;
    api.mockImplementation(async ({ url }) => {
        if (url === '/org/projects')
            return [
                {
                    projectUuid: 'project',
                    name: 'Development',
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            ];
        if (url === '/user/warehouseCredentials') return [];
        if (url.includes('warehouse-connection-user-credentials')) {
            if (enumerationError)
                throw {
                    error: {
                        name: 'ForbiddenError',
                        message: 'Viewer cannot enumerate.',
                    },
                };
            if (!multi)
                throw {
                    error: {
                        name: 'SingleConnectionProjectError',
                        message: 'Single connection.',
                    },
                };
            return [
                {
                    warehouseConnectionUuid: 'original',
                    name: 'Default',
                    isOriginal: true,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    requireUserCredentials: false,
                },
                {
                    warehouseConnectionUuid: 'extra',
                    name: 'Analytics',
                    isOriginal: false,
                    warehouseType: WarehouseTypes.BIGQUERY,
                    requireUserCredentials: false,
                },
            ];
        }
        if (url.includes('ai-access/me')) {
            if (accessError)
                throw {
                    error: {
                        name: 'Error',
                        message: 'Warehouse status failed.',
                    },
                };
            return url.includes('connection=extra')
                ? {
                      ...ready(),
                      source: 'ai_service_account',
                      principalKind: 'service_account',
                  }
                : access;
        }
        throw new Error(`Unexpected request: ${url}`);
    });
});
describe('approval warehouse setup', () => {
    it.each([false, true])(
        'bounds 30 projects and their bindings, unmount=%s',
        async (leaveEarly) => {
            const projects = Array.from({ length: 30 }, (_, index) => ({
                ...project,
                projectUuid: `project-${index}`,
                name: `Project ${index}`,
            }));
            const resolvers: (() => void)[] = [];
            const signals: AbortSignal[] = [];
            let active = 0;
            let maximum = 0;
            let started = 0;
            api.mockImplementation(async ({ url, signal }) => {
                if (url === '/org/projects') return projects;
                started += 1;
                active += 1;
                maximum = Math.max(maximum, active);
                if (signal) signals.push(signal);
                await new Promise<void>((resolve) =>
                    resolvers.push(() => {
                        active -= 1;
                        resolve();
                    }),
                );
                if (url.includes('warehouse-connection-user-credentials'))
                    return [
                        {
                            warehouseConnectionUuid: 'original',
                            name: 'Default',
                            isOriginal: true,
                        },
                        {
                            warehouseConnectionUuid: 'extra',
                            name: 'Additional',
                            isOriginal: false,
                        },
                    ];
                return ready();
            });
            const { unmount } = renderStep(projects);
            await screen.findByText('Project 29');
            const lastRow = screen
                .getByText('Project 29')
                .closest<HTMLElement>('.mantine-Paper-root')!;
            expect(
                within(lastRow).getByLabelText('Loading warehouse sign-ins'),
            ).toBeVisible();
            await waitFor(() => expect(started).toBe(4));
            try {
                if (leaveEarly) {
                    unmount();
                    expect(signals).toHaveLength(4);
                    expect(signals.every((signal) => signal.aborted)).toBe(
                        true,
                    );
                    await act(async () => {
                        resolvers.splice(0).forEach((resolve) => resolve());
                    });
                    expect(started).toBe(4);
                } else {
                    for (let batch = 0; batch < 24; batch += 1) {
                        await act(async () => {
                            resolvers.splice(0).forEach((resolve) => resolve());
                        });
                        if (screen.queryAllByText('Ready').length === 60) break;
                        await waitFor(() =>
                            expect(
                                resolvers.length > 0 ||
                                    screen.queryAllByText('Ready').length ===
                                        60,
                            ).toBe(true),
                        );
                    }
                    expect(await screen.findAllByText('Ready')).toHaveLength(
                        60,
                    );
                    expect(started).toBe(90);
                    expect(
                        screen.queryByLabelText('Loading warehouse sign-ins'),
                    ).not.toBeInTheDocument();
                }
                expect(maximum).toBe(4);
            } finally {
                unmount();
                await act(async () => {
                    resolvers.splice(0).forEach((resolve) => resolve());
                });
            }
        },
    );
    it.each([false, true])(
        'never shows defer while an all-ready list loads, multiple bindings=%s',
        async (multiple) => {
            multi = multiple;
            const seen: string[] = [];
            const observer = new MutationObserver((records) => {
                records.forEach((record) =>
                    record.addedNodes.forEach((node) =>
                        seen.push(node.textContent ?? ''),
                    ),
                );
            });
            observer.observe(document.body, { childList: true, subtree: true });
            try {
                renderStep();
                expect(
                    screen.queryByText('Do this later'),
                ).not.toBeInTheDocument();
                await waitFor(() =>
                    expect(screen.getAllByText('Ready')).toHaveLength(
                        multiple ? 2 : 1,
                    ),
                );
                expect(
                    screen.queryByText('Do this later'),
                ).not.toBeInTheDocument();
                expect(
                    seen.some((text) => text.includes('Do this later')),
                ).toBe(false);
                expect(
                    screen.queryByText(/Your connection is saved/),
                ).not.toBeInTheDocument();
                expect(
                    screen.getByText('No connection was created.'),
                ).toBeVisible();
                expect(
                    screen.queryByText(/set up warehouse sign-ins for later/),
                ).not.toBeInTheDocument();
                expect(api).toHaveBeenCalledTimes(multiple ? 4 : 3);
            } finally {
                observer.disconnect();
            }
        },
    );
    it('loads readiness with viewer endpoints and shows ready', async () => {
        renderStep();
        expect(await screen.findByText('Ready')).toBeVisible();
        expect(screen.getByText('Development')).toBeVisible();
        expect(
            api.mock.calls.some(
                ([args]) => args.url === '/projects/project/ai-access/me',
            ),
        ).toBe(true);
        expect(
            api.mock.calls.some(
                ([args]) =>
                    args.url.includes('/capabilities') ||
                    args.url.endsWith('/warehouse-connections'),
            ),
        ).toBe(false);
        expect(
            screen.queryByRole('button', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
    });
    it.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.SIGN_IN_EXPIRED,
    ])('uses the existing sign-in card for %s', async (reason) => {
        access = refused(reason, AiAccessRefusalAction.SIGN_IN);
        renderStep();
        const button = await screen.findByRole('button', { name: 'Sign in' });
        expect(screen.getByText('Server warehouse explanation.')).toBeVisible();
        if (reason === AiAccessRefusalReason.SIGN_IN_EXPIRED)
            expect(screen.getByText('Expired')).toBeVisible();
        fireEvent.click(button);
        expect(login.mutate).toHaveBeenCalledOnce();
        expect(screen.getByText('No connection was created.')).toBeVisible();
        expect(
            screen.getByText(
                'You can still set up warehouse sign-ins for later.',
            ),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Do this later' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/myAgentConnections?tab=warehouses',
        );
        expect(api).toHaveBeenCalledTimes(4);
    });
    it('does not call disabled agent access ready', async () => {
        access = { ...ready(), enabled: false, source: null, identity: null };
        renderStep();
        expect(
            await screen.findByText(
                'Ask an administrator to set up agent sign-in',
            ),
        ).toBeVisible();
        expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    });
    it('shows administrator setup when the server requires it', async () => {
        access = refused(
            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            AiAccessRefusalAction.ASK_ADMIN,
        );
        renderStep();
        expect(
            await screen.findByText(
                'Ask an administrator to set up agent sign-in',
            ),
        ).toBeVisible();
        expect(screen.getByText('Server warehouse explanation.')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
    });
    it('shows a project fallback when viewer enumeration is unavailable', async () => {
        enumerationError = true;
        renderStep();
        expect(
            await screen.findByText(
                'Ask an administrator to set up agent sign-in',
            ),
        ).toBeVisible();
        expect(screen.getByText('Development')).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Do this later' }),
        ).toBeVisible();
    });
    it('shows a retryable readiness error', async () => {
        accessError = true;
        renderStep();
        expect(
            (await screen.findAllByText('Warehouse status failed.'))[0],
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Do this later' }),
        ).toBeVisible();
        accessError = false;
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Ready')).toBeVisible();
    });
    it('checks additional connections and reuses the shared agent account card', async () => {
        multi = true;
        renderStep();
        expect(
            await screen.findByRole('heading', { name: 'BigQuery' }),
        ).toBeVisible();
        expect(screen.getByText('Analytics')).toBeVisible();
        await waitFor(() =>
            expect(
                api.mock.calls.some(
                    ([args]) =>
                        args.url ===
                        '/projects/project/ai-access/me?connection=extra',
                ),
            ).toBe(true),
        );
        expect(
            screen.queryByRole('button', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
    });
});

it('says the connection is saved only when the server sent no review-only notice', async () => {
    access = refused(
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalAction.SIGN_IN,
    );
    renderStep([project], null);
    expect(await screen.findByText('Your connection is saved.')).toBeVisible();
    expect(
        await screen.findByText('Sign in to run queries on these warehouses.'),
    ).toBeVisible();
    expect(
        screen.queryByText('No connection was created.'),
    ).not.toBeInTheDocument();
});
