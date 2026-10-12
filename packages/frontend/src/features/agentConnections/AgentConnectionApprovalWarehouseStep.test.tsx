import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    WarehouseTypes,
    type AiAccessForUser,
    type AgentConnectionApprovalProject,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { AgentConnectionApprovalWarehouseStep } from './AgentConnectionApprovalWarehouseStep';

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
const renderStep = () =>
    renderWithProviders(
        <MemoryRouter>
            <AgentConnectionApprovalWarehouseStep projects={[project]} />
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
    });
    it('shows a retryable readiness error', async () => {
        accessError = true;
        renderStep();
        expect(
            (await screen.findAllByText('Warehouse status failed.'))[0],
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
