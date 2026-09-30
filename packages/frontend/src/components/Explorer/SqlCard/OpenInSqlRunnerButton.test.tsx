import {
    WarehouseTypes,
    type ConnectionRoute,
    type Project,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { renderWithProviders } from '../../../testing/testUtils';
import { EventName } from '../../../types/Events';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { organizationUuid: 'user-org-uuid' } },
        health: { data: undefined },
    }),
}));

const LocationState = () => {
    const location = useLocation();
    return (
        <output data-testid="location-state">
            {JSON.stringify(location.state)}
        </output>
    );
};

const renderButton = (
    warehouseConnectionUuid: string | null | undefined,
    connectionRoute: ConnectionRoute | undefined,
) =>
    renderWithProviders(
        <MemoryRouter>
            <OpenInSqlRunnerButton
                projectUuid="project-uuid"
                sql="select 1"
                warehouseConnectionUuid={warehouseConnectionUuid}
                connectionRoute={connectionRoute}
                project={{
                    organizationUuid: 'org-uuid',
                    warehouseConnection: {
                        type: WarehouseTypes.POSTGRES,
                    } as Project['warehouseConnection'],
                }}
            />
            <LocationState />
        </MemoryRouter>,
    );

describe('OpenInSqlRunnerButton', () => {
    beforeEach(() => {
        track.mockClear();
    });

    it.each([
        [
            'finance-uuid',
            'multi',
            {
                carriesConnection: true,
                warehouseConnectionId: 'finance-uuid',
                connectionKind: 'extra',
                warehouseType: null,
            },
        ],
        [
            null,
            'multi',
            {
                carriesConnection: true,
                warehouseConnectionId: null,
                connectionKind: 'primary',
                warehouseType: WarehouseTypes.POSTGRES,
            },
        ],
        [
            null,
            'single',
            {
                carriesConnection: false,
                warehouseConnectionId: null,
                connectionKind: 'primary',
                warehouseType: WarehouseTypes.POSTGRES,
            },
        ],
    ] as const)(
        'tracks the click with connection %s on a %s project',
        async (connection, connectionRoute, expected) => {
            renderButton(connection, connectionRoute);

            await userEvent
                .setup()
                .click(
                    screen.getByRole('link', { name: 'Open in SQL Runner' }),
                );

            expect(track).toHaveBeenCalledTimes(1);
            expect(track).toHaveBeenCalledWith({
                name: EventName.OPEN_IN_SQL_RUNNER_CLICKED,
                properties: {
                    organizationId: 'org-uuid',
                    projectId: 'project-uuid',
                    connectionCount: null,
                    entryPoint: 'explorer_sql_card',
                    connectionRoute,
                    ...expected,
                },
            });
            expect(JSON.stringify(track.mock.calls)).not.toContain('select 1');
        },
    );

    it.each([
        ['finance-uuid', 'finance-uuid'],
        [null, null],
    ])(
        'passes the explore connection %s to the runner',
        async (connection, expected) => {
            renderButton(connection, 'multi');

            await userEvent
                .setup()
                .click(
                    screen.getByRole('link', { name: 'Open in SQL Runner' }),
                );

            expect(screen.getByTestId('location-state')).toHaveTextContent(
                JSON.stringify({
                    sql: 'select 1',
                    warehouseConnectionUuid: expected,
                }),
            );
        },
    );

    it.each([undefined, null])(
        'keeps the single-project location state at SQL only for binding %s',
        async (connection) => {
            renderButton(connection, 'single');

            await userEvent
                .setup()
                .click(
                    screen.getByRole('link', { name: 'Open in SQL Runner' }),
                );

            expect(screen.getByTestId('location-state').textContent).toBe(
                JSON.stringify({ sql: 'select 1' }),
            );
        },
    );

    it('waits for the explore binding in a multi-connection project', () => {
        renderButton(undefined, 'multi');

        expect(
            screen.getByRole('link', { name: 'Open in SQL Runner' }),
        ).toHaveAttribute('data-disabled');
    });

    it('waits for the project route before opening the runner', () => {
        renderButton('finance-uuid', undefined);

        expect(
            screen.getByRole('link', { name: 'Open in SQL Runner' }),
        ).toHaveAttribute('data-disabled');
    });
});
