import {
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { useActiveConnection } from '../hooks/useActiveConnection';
import {
    readLastUsedConnection,
    writeLastUsedConnection,
} from '../utils/activeConnection';
import { ActiveConnectionProvider } from './ActiveConnectionProvider';

const showToastInfo = vi.hoisted(() => vi.fn());

vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo }),
}));

const projectUuid = 'project-uuid';

const connection = (
    warehouseConnectionUuid: string,
    name: string,
): SqlRunnerWarehouseConnection => ({
    warehouseConnectionUuid,
    name,
    isOriginal: warehouseConnectionUuid === 'original-uuid',
    warehouseType: WarehouseTypes.POSTGRES,
});

const original = connection('original-uuid', 'Warehouse');
const finance = connection('finance-uuid', 'Finance');
const reporting = connection('reporting-uuid', 'Reporting');

const Consumer: FC = () => {
    const {
        activeConnectionUuid,
        isConnectionSettled,
        activeTable,
        setActiveTable,
    } = useActiveConnection();
    return (
        <>
            <span data-testid="active">{activeConnectionUuid ?? 'none'}</span>
            <span data-testid="settled">{String(isConnectionSettled)}</span>
            <span data-testid="table">{activeTable?.table ?? 'none'}</span>
            <button
                type="button"
                onClick={() =>
                    setActiveTable({
                        connectionId: 'finance-uuid',
                        database: 'finance',
                        schema: 'public',
                        table: 'ledger',
                    })
                }
            >
                open ledger
            </button>
        </>
    );
};

const renderProvider = (
    connections: SqlRunnerWarehouseConnection[],
    connectionHint?: string | null,
) => {
    const view = renderWithProviders(
        <ActiveConnectionProvider
            projectUuid={projectUuid}
            connections={connections}
            connectionHint={connectionHint}
        >
            <Consumer />
        </ActiveConnectionProvider>,
    );
    return {
        ...view,
        rerenderWith: (next: SqlRunnerWarehouseConnection[]) =>
            view.rerender(
                <ActiveConnectionProvider
                    projectUuid={projectUuid}
                    connections={next}
                >
                    <Consumer />
                </ActiveConnectionProvider>,
            ),
    };
};

describe('ActiveConnectionProvider', () => {
    beforeEach(() => {
        window.localStorage.clear();
        showToastInfo.mockClear();
    });

    it('opens on the last connection used in the project', () => {
        writeLastUsedConnection(projectUuid, 'finance-uuid');
        renderProvider([original, finance]);

        expect(screen.getByTestId('active')).toHaveTextContent('finance-uuid');
        expect(screen.getByTestId('settled')).toHaveTextContent('true');
    });

    it('waits for a pick when nothing was used before', () => {
        renderProvider([original, finance]);

        expect(screen.getByTestId('active')).toHaveTextContent('none');
        expect(screen.getByTestId('settled')).toHaveTextContent('false');
    });

    it('waits for a pick when a hint is unknown, even with one listed connection', () => {
        renderProvider([original], 'unknown-uuid');

        expect(screen.getByTestId('active')).toHaveTextContent('none');
        expect(screen.getByTestId('settled')).toHaveTextContent('false');
    });

    it('drops a connection removed while the runner is open, with its table', async () => {
        writeLastUsedConnection(projectUuid, 'finance-uuid');
        const view = renderProvider([original, finance]);
        await userEvent.setup().click(screen.getByText('open ledger'));
        expect(screen.getByTestId('table')).toHaveTextContent('ledger');

        act(() => view.rerenderWith([original, reporting]));

        expect(screen.getByTestId('active')).toHaveTextContent('none');
        expect(screen.getByTestId('settled')).toHaveTextContent('false');
        expect(screen.getByTestId('table')).toHaveTextContent('none');
        expect(readLastUsedConnection(projectUuid)).toBeUndefined();
        expect(showToastInfo).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                title: '"Finance" was removed from this project',
            }),
        );
    });
});
