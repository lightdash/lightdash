import { type ConnectionRoute } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { renderWithProviders } from '../../../testing/testUtils';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

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
            />
            <LocationState />
        </MemoryRouter>,
    );

describe('OpenInSqlRunnerButton', () => {
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

    it('keeps the single-project location state unchanged', async () => {
        renderButton(undefined, 'single');

        await userEvent
            .setup()
            .click(screen.getByRole('link', { name: 'Open in SQL Runner' }));

        expect(screen.getByTestId('location-state')).toHaveTextContent(
            JSON.stringify({ sql: 'select 1' }),
        );
    });

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
