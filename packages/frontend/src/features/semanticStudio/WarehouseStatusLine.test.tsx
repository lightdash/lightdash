import { WarehouseTypes } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { WarehouseStatusLine } from './WarehouseStatusLine';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

const SETTINGS_PATH = '/generalSettings/projectManagement/project/settings';

const renderLine = ({
    listsTables,
    settingsPath,
}: {
    listsTables: boolean;
    settingsPath: string | null;
}) => {
    api.mockImplementation(({ url }: { url: string }) => {
        if (url === '/projects/project') {
            return Promise.resolve({
                projectUuid: 'project',
                warehouseConnection: { type: WarehouseTypes.POSTGRES },
            });
        }
        if (url === '/projects/project/sqlRunner/tables') {
            return listsTables
                ? Promise.resolve({
                      db: { schema_a: { table_a: {}, table_b: {} } },
                  })
                : Promise.reject(new Error('Listing failed'));
        }
        return Promise.reject(new Error(`Unexpected ${url}`));
    });
    renderWithProviders(
        <MemoryRouter>
            <WarehouseStatusLine
                projectUuid="project"
                settingsPath={settingsPath}
            />
        </MemoryRouter>,
    );
};

beforeEach(() => {
    api.mockReset();
});

describe('WarehouseStatusLine', () => {
    it('shows the warehouse, where its tables are, how many, and a link to edit it', async () => {
        renderLine({ listsTables: true, settingsPath: SETTINGS_PATH });
        expect(
            await screen.findByText('db.schema_a · 2 tables'),
        ).toBeInTheDocument();
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Edit connection' }),
        ).toHaveAttribute('href', SETTINGS_PATH);
    });

    it('shows the warehouse without a count when its tables cannot be listed', async () => {
        renderLine({ listsTables: false, settingsPath: SETTINGS_PATH });
        expect(await screen.findByText('PostgreSQL')).toBeInTheDocument();
        await vi.waitFor(() =>
            expect(api).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project/sqlRunner/tables',
                }),
            ),
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
        expect(screen.queryByText(/tables?$/)).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Edit connection' }),
        ).toBeInTheDocument();
    });

    it('asks for an admin instead of linking to settings it cannot open', async () => {
        renderLine({ listsTables: true, settingsPath: null });
        expect(
            await screen.findByText('db.schema_a · 2 tables'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Ask a project admin to change the connection'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Edit connection' }),
        ).not.toBeInTheDocument();
    });
});
