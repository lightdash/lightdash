import { TABLE_LISTING_FAILED_CODE, WarehouseTypes } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { WarehouseStatusLine } from './WarehouseStatusLine';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

const SETTINGS_PATH = '/generalSettings/projectManagement/project/settings';

const NO_INFORMATION_SCHEMA =
    '[TABLE_OR_VIEW_NOT_FOUND] The table or view `information_schema`.`tables` cannot be found. SQLSTATE: 42P01';

const listingError = (data: { [key: string]: unknown }) => ({
    status: 'error',
    error: {
        name: 'WarehouseQueryError',
        statusCode: 400,
        message: NO_INFORMATION_SCHEMA,
        data,
    },
});

const renderLine = ({
    listsTables,
    settingsPath,
    failureData = {},
}: {
    listsTables: boolean;
    settingsPath: string | null;
    failureData?: { [key: string]: unknown };
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
                : Promise.reject(listingError(failureData));
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
        expect(screen.queryByText(/\d+ tables?$/)).not.toBeInTheDocument();
        expect(screen.getByText("Can't list tables")).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Edit connection' }),
        ).toBeInTheDocument();
    });

    it('says why tables cannot be listed, with the warehouse message behind Details', async () => {
        renderLine({
            listsTables: false,
            settingsPath: SETTINGS_PATH,
            failureData: {
                code: TABLE_LISTING_FAILED_CODE,
                failure: {
                    kind: 'no_information_schema',
                    catalog: 'catalog_a',
                    message: NO_INFORMATION_SCHEMA,
                },
            },
        });
        expect(
            await screen.findByText(
                "Can't list tables in catalog_a: it has no information_schema",
            ),
        ).toBeInTheDocument();
        const details = screen.getByRole('button', { name: 'Details' });
        await userEvent.click(details);
        expect(details).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(NO_INFORMATION_SCHEMA)).toBeInTheDocument();
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
