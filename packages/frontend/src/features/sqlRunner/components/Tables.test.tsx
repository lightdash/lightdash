import { TABLE_LISTING_FAILED_CODE, type ApiError } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { store } from '../store';
import { Tables } from './Tables';

const MESSAGE =
    "[INSUFFICIENT_PERMISSIONS] Insufficient privileges: User does not have USE SCHEMA on Schema 'catalog_a.schema_a'. SQLSTATE: 42501";

const listingError: ApiError = {
    status: 'error',
    error: {
        name: 'WarehouseQueryError',
        statusCode: 400,
        message: MESSAGE,
        data: {
            code: TABLE_LISTING_FAILED_CODE,
            failure: {
                kind: 'missing_privilege',
                privilege: 'USE SCHEMA',
                catalog: 'catalog_a',
                schema: 'schema_a',
                message: MESSAGE,
            },
        },
    },
};

vi.mock('../hooks/useTables', () => ({
    useTables: () => ({
        data: undefined,
        error: listingError,
        isLoading: false,
        isSuccess: false,
    }),
}));

describe('Tables', () => {
    it('shows why tables could not be listed instead of an empty list', async () => {
        renderWithProviders(
            <Provider store={store}>
                <Tables onRefresh={vi.fn()} />
            </Provider>,
        );

        expect(
            screen.getByText(
                "Can't list tables: the connection's user is missing USE SCHEMA on catalog_a.schema_a",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('No results found')).not.toBeInTheDocument();

        const details = screen.getByRole('button', { name: 'Details' });
        expect(details).toHaveAttribute('aria-expanded', 'false');
        await userEvent.click(details);
        expect(details).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    });
});
