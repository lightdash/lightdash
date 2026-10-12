import {
    AgentCapability,
    type AgentConnectionApprovalReview,
} from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import AgentConnectionApprovalPage from './AgentConnectionApprovalPage';

let enabled: boolean | undefined = true;
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: enabled === undefined ? undefined : { enabled },
    }),
}));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('./AgentConnectionApprovalWarehouseStep', () => ({
    AgentConnectionApprovalWarehouseStep: () => null,
}));

const requestUuid = '11111111-1111-4111-8111-111111111111';
const firstProject = '22222222-2222-4222-8222-222222222222';
const secondProject = '33333333-3333-4333-8333-333333333333';
const completionUrl = `http://localhost/api/v2/user/agent-connections/requests/${requestUuid}/completion`;
const offered = (capability: AgentCapability) => ({
    capability,
    visibility: 'offered' as const,
    reason: null,
    reasonCode: null,
});
const review = (): AgentConnectionApprovalReview => ({
    request: {
        name: 'work',
        clientLabel: 'CLI',
        expiresInSeconds: 86400,
        expiresAt: '2099-10-12T12:00:00Z',
    },
    notice: 'Review only. No connection will be created.',
    nonce: 'private-decision-nonce',
    revision: 1,
    projects: [
        {
            projectUuid: firstProject,
            name: 'Development',
            selectable: true,
            reason: null,
            capabilities: [
                offered(AgentCapability.ReadDiscover),
                offered(AgentCapability.Query),
                offered(AgentCapability.Delete),
                offered(AgentCapability.Publish),
                {
                    capability: AgentCapability.RawSql,
                    visibility: 'blocked',
                    reason: 'Your permissions in this project do not allow this action.',
                    reasonCode: 'person_permission',
                },
                {
                    capability: AgentCapability.Export,
                    visibility: 'hidden',
                    reason: null,
                    reasonCode: null,
                },
            ],
        },
        {
            projectUuid: secondProject,
            name: 'Production',
            selectable: true,
            reason: null,
            capabilities: [
                offered(AgentCapability.ReadDiscover),
                {
                    capability: AgentCapability.Query,
                    visibility: 'blocked',
                    reason: 'This action is turned off for agents.',
                    reasonCode: 'action_disabled',
                },
            ],
        },
        {
            projectUuid: '44444444-4444-4444-8444-444444444444',
            name: 'Restricted',
            selectable: false,
            reason: 'This person is not allowed to use agents.',
            capabilities: [],
        },
    ],
});
const renderPage = () =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={[
                `/agent/connection-approval?request=${requestUuid}`,
            ]}
        >
            <section data-testid="approval-surface">
                <AgentConnectionApprovalPage />
            </section>
        </MemoryRouter>,
    );
const loadPage = async () => {
    const result = renderPage();
    await screen.findByRole('button', { name: 'Approve' });
    return result;
};
const api = vi.mocked(lightdashApi);
const error = (
    statusCode: number,
    code: string,
    renewed?: AgentConnectionApprovalReview,
) => ({
    status: 'error',
    error: {
        statusCode,
        code,
        name: 'AgentConnectionApprovalError',
        message: 'Server explanation.',
        ...(renewed ? { review: renewed } : {}),
    },
});

beforeEach(() => {
    vi.clearAllMocks();
    enabled = true;
    api.mockImplementation(async ({ method }) =>
        method === 'GET' ? review() : { completionUrl },
    );
    vi.spyOn(window, 'open').mockReturnValue(null);
});

describe('approval review', () => {
    it.each([false, undefined])(
        'renders nothing and makes no request when enabled is %s',
        (value) => {
            enabled = value;
            renderPage();
            expect(
                screen.getByTestId('approval-surface'),
            ).toBeEmptyDOMElement();
            expect(api).not.toHaveBeenCalled();
        },
    );
    it('defaults to opt-out with one action list, hidden and blocked rows and server reasons', async () => {
        await loadPage();
        for (const name of [
            'Development',
            'Production',
            'Read and discover',
            'Query data',
            'Delete content',
            'Publish and share',
        ])
            expect(screen.getByRole('checkbox', { name })).toBeChecked();
        expect(
            screen.getAllByRole('checkbox', { name: 'Read and discover' }),
        ).toHaveLength(1);
        expect(screen.queryByText('Export results')).not.toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Raw SQL' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('checkbox', { name: 'Raw SQL' }),
        ).not.toBeChecked();
        expect(
            screen.getByRole('checkbox', { name: 'Raw SQL' }),
        ).toHaveAccessibleDescription(
            'Your permissions in this project do not allow this action.',
        );
        expect(
            screen.getByRole('checkbox', { name: 'Restricted' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('checkbox', { name: 'Restricted' }),
        ).toHaveAccessibleDescription(
            'This person is not allowed to use agents.',
        );
        expect(
            screen.getByText(
                'Deleted content cannot be restored by the agent.',
            ),
        ).toBeVisible();
        expect(
            screen.getByText('Other people will see what the agent publishes.'),
        ).toBeVisible();
        const queryRow = screen
            .getByRole('checkbox', { name: 'Query data' })
            .closest('section')!;
        expect(
            within(queryRow).getByText('Available in 1 of 2 selected projects'),
        ).toBeVisible();
        fireEvent.click(
            within(queryRow).getByRole('button', { name: 'Show restrictions' }),
        );
        await waitFor(() =>
            expect(
                within(queryRow).getByText(
                    'Production: This action is turned off for agents.',
                ),
            ).toBeVisible(),
        );
        expect(screen.getByText(review().notice)).toBeVisible();
        expect(
            screen.getByText('Expires 24 hours after approval'),
        ).toBeVisible();
    });
    it('renders server reason text even when no reason code is supplied', async () => {
        const data = review();
        const capability = data.projects[0].capabilities.find(
            (entry) => entry.capability === AgentCapability.RawSql,
        )!;
        capability.reasonCode = null;
        capability.reason = 'The available permissions could not be checked.';
        api.mockResolvedValue(data);
        await loadPage();
        expect(
            screen.getByRole('checkbox', { name: 'Raw SQL' }),
        ).toHaveAccessibleDescription(capability.reason);
        expect(screen.getByText('work · CLI')).toBeVisible();
    });
    it('renders the response notice and actual expiry without an input', async () => {
        const data = review();
        data.request.expiresInSeconds = 172801;
        Object.assign(data, { notice: 'A notice from the server.' });
        api.mockResolvedValue(data);
        await loadPage();
        expect(screen.getByText('A notice from the server.')).toBeVisible();
        expect(
            screen.getByText('Expires 2 days, 1 second after approval'),
        ).toBeVisible();
        expect(
            screen.getByText('This is longer than the usual 24 hours.'),
        ).toBeVisible();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    });
    it('preserves unticks during project changes without fetching and disables approval for zero projects', async () => {
        await loadPage();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Query data' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Development' }));
        expect(
            screen.getByRole('checkbox', { name: 'Query data' }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Development' }));
        expect(
            screen.getByRole('checkbox', { name: 'Query data' }),
        ).not.toBeChecked();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Development' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Production' }));
        expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
        expect(api).toHaveBeenCalledTimes(1);
    });
    it('posts the exact approval body and never puts the nonce in a URL', async () => {
        await loadPage();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Query data' }));
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
        expect(api).toHaveBeenLastCalledWith({
            version: 'v2',
            url: `/user/agent-connections/requests/${requestUuid}/decision`,
            method: 'POST',
            sensitive: true,
            body: JSON.stringify({
                decision: 'approve',
                revision: 1,
                nonce: review().nonce,
                projectUuids: [firstProject, secondProject],
                capabilities: [
                    AgentCapability.ReadDiscover,
                    AgentCapability.Delete,
                    AgentCapability.Publish,
                ],
            }),
        });
        expect(
            api.mock.calls.every(
                ([args]) => !args.url.includes(review().nonce),
            ),
        ).toBe(true);
        expect(window.location.href).not.toContain(review().nonce);
    });
    it('allows an empty action list', async () => {
        const data = review();
        data.projects.forEach((p) => {
            p.capabilities = [];
        });
        api.mockResolvedValueOnce(data);
        await loadPage();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
        expect(
            JSON.parse(String(api.mock.calls[1][0].body)).capabilities,
        ).toEqual([]);
    });
    it('posts deny with empty arrays', async () => {
        await loadPage();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
        expect(JSON.parse(String(api.mock.calls[1][0].body))).toEqual({
            decision: 'deny',
            revision: 1,
            nonce: review().nonce,
            projectUuids: [],
            capabilities: [],
        });
    });
    it.each([true, false])(
        'renews a 409 with embedded review %s and preserves project and action unticks',
        async (embedded) => {
            const renewed = {
                ...review(),
                nonce: 'renewed-private-nonce',
                revision: 2,
            };
            api.mockResolvedValueOnce(review())
                .mockRejectedValueOnce(
                    error(
                        409,
                        'approval_selection_changed',
                        embedded ? renewed : undefined,
                    ),
                )
                .mockResolvedValueOnce(embedded ? { completionUrl } : renewed);
            await loadPage();
            fireEvent.click(
                screen.getByRole('checkbox', { name: 'Production' }),
            );
            fireEvent.click(
                screen.getByRole('checkbox', { name: 'Query data' }),
            );
            fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
            await screen.findByText(
                'Your permissions changed. Check the selection and approve again.',
            );
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Approve' }),
                ).toBeEnabled(),
            );
            expect(
                screen.getByRole('checkbox', { name: 'Production' }),
            ).not.toBeChecked();
            expect(
                screen.getByRole('checkbox', { name: 'Query data' }),
            ).not.toBeChecked();
            fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
            await waitFor(() =>
                expect(
                    api.mock.calls.filter(([args]) => args.method === 'POST'),
                ).toHaveLength(2),
            );
            const calls = api.mock.calls.filter(
                ([args]) => args.method === 'POST',
            );
            expect(JSON.parse(String(calls[1][0].body))).toMatchObject({
                revision: 2,
                nonce: renewed.nonce,
                projectUuids: [firstProject],
            });
        },
    );
    it.each([
        [410, 'approval_request_expired'],
        [409, 'approval_request_consumed'],
    ])(
        'shows terminal %s state without decision buttons',
        async (status, code) => {
            api.mockRejectedValue(error(Number(status), String(code)));
            renderPage();
            await screen.findByText('Server explanation.');
            expect(
                screen.queryByRole('button', { name: 'Approve' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Cancel' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Retry' }),
            ).not.toBeInTheDocument();
        },
    );
    it('shows the server error and reloads a stale nonce', async () => {
        api.mockResolvedValueOnce(review())
            .mockRejectedValueOnce(error(403, 'csrf_failed'))
            .mockResolvedValueOnce({
                ...review(),
                nonce: 'new-nonce',
                revision: 2,
            });
        await loadPage();
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
        expect(
            await screen.findByText(
                'Your permissions changed. Check the selection and approve again.',
            ),
        ).toBeVisible();
    });
    it('shows an ordinary server error without losing the form', async () => {
        api.mockResolvedValueOnce(review()).mockRejectedValueOnce(
            error(500, 'internal_error'),
        );
        await loadPage();
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        expect(await screen.findByText('Server explanation.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    });
});

describe('completion delivery', () => {
    it.each(['Approve', 'Cancel'])(
        'opens synchronously, completes %s once, and retains the original page',
        async (button) => {
            const replace = vi.fn();
            const focus = vi.fn();
            const popup = {
                location: { replace },
                focus,
                close: vi.fn(),
                closed: false,
                opener: window,
            };
            vi.mocked(window.open).mockReturnValue(popup as unknown as Window);
            let resolveDecision!: (value: { completionUrl: string }) => void;
            api.mockResolvedValueOnce(review()).mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveDecision = resolve;
                    }),
            );
            await loadPage();
            fireEvent.click(screen.getByRole('button', { name: button }));
            expect(window.open).toHaveBeenCalledTimes(1);
            expect(replace).not.toHaveBeenCalled();
            await waitFor(() => expect(resolveDecision).toBeDefined());
            resolveDecision({ completionUrl });
            const link = await screen.findByRole('link', {
                name: 'Return to the CLI',
            });
            expect(replace).toHaveBeenCalledExactlyOnceWith(completionUrl);
            expect(popup.opener).toBeNull();
            expect(
                screen.getByRole('heading', {
                    name:
                        button === 'Approve'
                            ? 'Connect your warehouses'
                            : 'Approval cancelled',
                }),
            ).toBeVisible();
            fireEvent.click(link);
            fireEvent.click(link);
            expect(replace).toHaveBeenCalledTimes(1);
            expect(focus).toHaveBeenCalledTimes(2);
            expect(window.location.href).not.toContain('/completion');
        },
    );
    it('offers a usable fallback if the popup was blocked', async () => {
        await loadPage();
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        const link = await screen.findByRole('link', {
            name: 'Return to the CLI',
        });
        expect(link).toHaveAttribute('href', completionUrl);
        expect(link).toHaveAttribute('target', '_blank');
        expect(
            screen.getByText(
                'No connection was created. You can still set up warehouse sign-ins for later.',
            ),
        ).toBeVisible();
        expect(
            screen.queryByText(/Your connection is saved/),
        ).not.toBeInTheDocument();
    });
});
