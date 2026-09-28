import {
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { EventName } from '../../../../types/Events';
import { ActiveConnectionProvider } from '../components/ActiveConnectionProvider';
import { ConnectionHintTracker } from '../components/ConnectionHintTracker';
import { useActiveConnection } from './useActiveConnection';
import { useTrackedConnectionSwitch } from './useTrackedConnectionSwitch';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { organizationUuid: 'org-uuid' } },
        health: { data: undefined },
    }),
}));
vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({ data: { organizationUuid: 'project-org-uuid' } }),
}));
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo: vi.fn() }),
}));

const primary: SqlRunnerWarehouseConnection = {
    warehouseConnectionUuid: 'primary-uuid',
    name: 'Warehouse',
    isOriginal: true,
    warehouseType: WarehouseTypes.POSTGRES,
};
const finance: SqlRunnerWarehouseConnection = {
    warehouseConnectionUuid: 'finance-uuid',
    name: 'Finance',
    isOriginal: false,
    warehouseType: WarehouseTypes.SNOWFLAKE,
};

const Switcher: FC = () => {
    const { activeConnectionUuid } = useActiveConnection();
    const switchConnection = useTrackedConnectionSwitch();
    return (
        <>
            <span data-testid="active">{activeConnectionUuid ?? 'none'}</span>
            <button
                type="button"
                onClick={() => switchConnection('finance-uuid', 'picker')}
            >
                finance
            </button>
            <button
                type="button"
                onClick={() => switchConnection('primary-uuid', 'table_click')}
            >
                primary
            </button>
        </>
    );
};

describe('useTrackedConnectionSwitch', () => {
    beforeEach(() => {
        track.mockClear();
        localStorage.clear();
    });

    it('tracks the switch with both connections and the source', async () => {
        renderWithProviders(
            <ActiveConnectionProvider
                projectUuid="project-uuid"
                connections={[primary, finance]}
                connectionHint={null}
            >
                <Switcher />
            </ActiveConnectionProvider>,
        );

        await userEvent.setup().click(screen.getByText('finance'));

        expect(screen.getByTestId('active')).toHaveTextContent('finance-uuid');
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith({
            name: EventName.SQL_RUNNER_CONNECTION_SWITCHED,
            properties: {
                organizationId: 'project-org-uuid',
                projectId: 'project-uuid',
                connectionCount: 2,
                source: 'picker',
                warehouseConnectionId: 'finance-uuid',
                connectionKind: 'extra',
                warehouseType: WarehouseTypes.SNOWFLAKE,
                previousWarehouseConnectionId: 'primary-uuid',
                previousConnectionKind: 'primary',
                previousWarehouseType: WarehouseTypes.POSTGRES,
            },
        });
    });

    it('does not track a switch to the active connection', async () => {
        renderWithProviders(
            <ActiveConnectionProvider
                projectUuid="project-uuid"
                connections={[primary, finance]}
                connectionHint={null}
            >
                <Switcher />
            </ActiveConnectionProvider>,
        );

        await userEvent.setup().click(screen.getByText('primary'));

        expect(track).not.toHaveBeenCalled();
    });
});

describe('ConnectionHintTracker', () => {
    beforeEach(() => {
        track.mockClear();
        localStorage.clear();
    });

    it.each([
        [
            'finance-uuid',
            {
                requestedConnectionKind: 'extra',
                outcome: 'applied',
                warehouseConnectionId: 'finance-uuid',
                connectionKind: 'extra',
                warehouseType: WarehouseTypes.SNOWFLAKE,
            },
        ],
        [
            null,
            {
                requestedConnectionKind: 'primary',
                outcome: 'applied',
                warehouseConnectionId: 'primary-uuid',
                connectionKind: 'primary',
                warehouseType: WarehouseTypes.POSTGRES,
            },
        ],
        [
            'removed-uuid',
            {
                requestedConnectionKind: 'extra',
                outcome: 'connection_not_found',
                warehouseConnectionId: 'removed-uuid',
                connectionKind: 'extra',
                warehouseType: null,
            },
        ],
    ] as const)(
        'tracks the carried connection %s once on arrival',
        (connectionHint, expected) => {
            const { rerender } = renderWithProviders(
                <ActiveConnectionProvider
                    projectUuid="project-uuid"
                    connections={[primary, finance]}
                    connectionHint={connectionHint}
                >
                    <ConnectionHintTracker
                        connectionHint={connectionHint}
                        organizationUuid="project-org-uuid"
                    />
                </ActiveConnectionProvider>,
            );
            rerender(
                <ActiveConnectionProvider
                    projectUuid="project-uuid"
                    connections={[primary, finance]}
                    connectionHint={connectionHint}
                >
                    <ConnectionHintTracker
                        connectionHint={connectionHint}
                        organizationUuid="project-org-uuid"
                    />
                </ActiveConnectionProvider>,
            );

            expect(track).toHaveBeenCalledTimes(1);
            expect(track).toHaveBeenCalledWith({
                name: EventName.SQL_RUNNER_CONNECTION_HINT_RESOLVED,
                properties: {
                    organizationId: 'project-org-uuid',
                    projectId: 'project-uuid',
                    connectionCount: 2,
                    entryPoint: 'open_in_sql_runner',
                    ...expected,
                },
            });
        },
    );
});
