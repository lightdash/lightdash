import {
    FeatureFlags,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { MyWarehouseConnectionsPanel } from './index';

let agentIdentity = false;
let configured = true;
let credentials: UserWarehouseCredentials[] = [];
const login = vi.fn();
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: {
            enabled: flag === FeatureFlags.AgentIdentity && agentIdentity,
        },
    }),
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: { auth: { snowflakeAi: { enabled: configured } } },
    }),
}));
vi.mock(
    '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useUserWarehouseCredentials: () => ({ data: credentials }),
    }),
);
vi.mock('../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({ mutate: login, isLoading: false }),
}));
vi.mock('./DeleteCredentialsModal', () => ({
    DeleteCredentialsModal: ({ opened }: { opened: boolean }) =>
        opened ? <div>Confirm sign out</div> : null,
}));

describe('My warehouse connections agent sign-in', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        agentIdentity = false;
        configured = true;
        credentials = [];
    });
    it.each([
        [false, true, false],
        [true, true, true],
        [true, false, false],
        [false, false, false],
    ])(
        'checks flag %s and configuration %s for visibility %s',
        (identityFlag, clientConfigured, visible) => {
            agentIdentity = identityFlag;
            configured = clientConfigured;
            renderWithProviders(<MyWarehouseConnectionsPanel />);
            const button = screen.queryByRole('button', {
                name: 'Connect agent',
            });
            if (visible) {
                expect(button).toBeInTheDocument();
                fireEvent.click(button!);
                expect(login).toHaveBeenCalledOnce();
            } else {
                expect(button).not.toBeInTheDocument();
            }
        },
    );
    it('offers sign out for an existing agent credential', () => {
        agentIdentity = true;
        credentials = [
            {
                uuid: 'credential',
                name: 'Agent session',
                userUuid: 'user',
                credentials: { type: WarehouseTypes.SNOWFLAKE, user: 'person' },
                project: null,
                purpose: UserWarehouseCredentialPurpose.AI,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ];
        renderWithProviders(<MyWarehouseConnectionsPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
        expect(screen.getByText('Confirm sign out')).toBeInTheDocument();
    });
});
