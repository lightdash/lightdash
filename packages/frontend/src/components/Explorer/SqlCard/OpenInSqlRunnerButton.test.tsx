import {
    WarehouseTypes,
    type ConnectionRoute,
    type Project,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { readSqlRunnerHandoff } from '../../../features/sqlRunner/utils/sqlRunnerHandoff';
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

const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

// The handoff the click wrote, read back from the URL it opened
const openedHandoff = () => {
    const url = openSpy.mock.calls[0][0] as string;
    const id = new URLSearchParams(url.split('?')[1]).get('handoff');
    return id ? readSqlRunnerHandoff(id) : null;
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
        </MemoryRouter>,
    );

describe('OpenInSqlRunnerButton', () => {
    beforeEach(() => {
        track.mockClear();
        openSpy.mockClear();
        window.localStorage.clear();
    });

    it('opens the runner in a new tab with the SQL', async () => {
        renderButton(null, 'single');

        await userEvent
            .setup()
            .click(screen.getByRole('link', { name: 'Open in SQL Runner' }));

        expect(openSpy).toHaveBeenCalledTimes(1);
        const [url, target] = openSpy.mock.calls[0];
        expect(url).toMatch(/^\/projects\/project-uuid\/sql-runner\?handoff=/);
        expect(target).toBe('_blank');
        expect(openedHandoff()).toEqual({ sql: 'select 1' });
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

            expect(openedHandoff()).toEqual({
                sql: 'select 1',
                warehouseConnectionUuid: expected,
            });
        },
    );

    it.each([undefined, null])(
        'keeps the single-project handoff at SQL only for binding %s',
        async (connection) => {
            renderButton(connection, 'single');

            await userEvent
                .setup()
                .click(
                    screen.getByRole('link', { name: 'Open in SQL Runner' }),
                );

            expect(openedHandoff()).toEqual({ sql: 'select 1' });
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
