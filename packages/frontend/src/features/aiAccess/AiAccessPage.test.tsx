import { WarehouseTypes } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiAccessPage } from './AiAccessPage';

let warehouseType = WarehouseTypes.POSTGRES;
let enabled = true;
let canManage = true;
const policyQuery = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project' }),
    Navigate: ({ to }: { to: string }) => <div>redirect to {to}</div>,
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            projectUuid: 'project',
            warehouseConnection: { type: warehouseType },
        },
        isLoading: false,
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled }, isLoading: false }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { rudder: {} } },
        user: { data: { ability: { can: () => canManage } } },
    }),
}));
vi.mock('../../hooks/useWarehouseConnections', () => ({
    useWarehouseConnections: () => ({
        data: {
            connections: [
                {
                    warehouseConnectionUuid: 'original-id',
                    name: 'Original Snowflake',
                    isOriginal: true,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
                {
                    warehouseConnectionUuid: 'extra-snowflake',
                    name: 'Extra Snowflake',
                    isOriginal: false,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
                {
                    warehouseConnectionUuid: 'extra-postgres',
                    name: 'Extra Postgres',
                    isOriginal: false,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            ],
        },
    }),
}));
vi.mock('./api', () => ({
    useAiAccessPolicy: (...args: unknown[]) => {
        policyQuery(...args);
        return { data: null };
    },
    useAiAccessCapabilities: () => ({ data: {} }),
}));
vi.mock('./AiIdentitySettings', () => ({
    AiIdentitySettings: ({
        connectionSelector,
    }: {
        connectionSelector: ReactNode;
    }) => connectionSelector,
}));

describe('Agent identity page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        warehouseType = WarehouseTypes.POSTGRES;
        enabled = true;
        canManage = true;
    });
    it('leaves the page for a Postgres project without loading the policy', () => {
        renderWithProviders(<AiAccessPage />);
        expect(
            screen.getByText(
                'redirect to /generalSettings/projectManagement/project',
            ),
        ).toBeInTheDocument();
        expect(policyQuery).not.toHaveBeenCalled();
    });
    it('redirects non-admins without rendering the page shell or loading the policy', () => {
        warehouseType = WarehouseTypes.SNOWFLAKE;
        canManage = false;
        renderWithProviders(<AiAccessPage />);
        expect(
            screen.getByText(
                'redirect to /generalSettings/projectManagement/project',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Agent identity')).not.toBeInTheDocument();
        expect(policyQuery).not.toHaveBeenCalled();
    });
    it('keeps the feature flag guard', () => {
        warehouseType = WarehouseTypes.SNOWFLAKE;
        enabled = false;
        renderWithProviders(<AiAccessPage />);
        expect(
            screen.getByText('Agent identity settings are not available.'),
        ).toBeInTheDocument();
        expect(policyQuery).not.toHaveBeenCalled();
    });
    it('lists only Snowflake connections and scopes the policy to the selection', () => {
        warehouseType = WarehouseTypes.SNOWFLAKE;
        renderWithProviders(<AiAccessPage />);
        expect(policyQuery).toHaveBeenLastCalledWith('project', null);
        fireEvent.click(
            screen.getByRole('combobox', { name: 'Warehouse connection' }),
        );
        expect(
            screen.queryByRole('option', { name: 'Extra Postgres' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', { name: 'Extra Snowflake' }),
        );
        expect(policyQuery).toHaveBeenLastCalledWith(
            'project',
            'extra-snowflake',
        );
        expect(screen.queryByText('Audit')).not.toBeInTheDocument();
    });
});
