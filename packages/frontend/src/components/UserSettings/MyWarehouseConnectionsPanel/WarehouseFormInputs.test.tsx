import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { useForm } from '@mantine/form';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { WarehouseFormInputs } from './WarehouseFormInputs';

let isDatabricksSsoEnabled = false;

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            siteUrl: 'http://localhost:3000',
            auth: { databricks: { enabled: isDatabricksSsoEnabled } },
        },
    }),
}));

const DatabricksForm: FC = () => {
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: 'my databricks',
            credentials: {
                type: WarehouseTypes.DATABRICKS,
                personalAccessToken: '',
            },
        },
    });

    return (
        <WarehouseFormInputs form={form} disabled={false} onClose={vi.fn()} />
    );
};

describe('WarehouseFormInputs - Databricks', () => {
    beforeEach(() => {
        isDatabricksSsoEnabled = false;
    });

    it('offers a personal access token input when SSO is not enabled', async () => {
        const { findByLabelText, queryByLabelText, queryByRole } =
            renderWithProviders(<DatabricksForm />);

        expect(await findByLabelText(/personal access token/i)).toBeDefined();
        expect(queryByLabelText(/authentication type/i)).toBeNull();
        expect(
            queryByRole('button', { name: /sign in with databricks/i }),
        ).toBeNull();
    });

    it('defaults to SSO when enabled and lets the user switch to a personal access token', async () => {
        isDatabricksSsoEnabled = true;
        const { findByRole, findByLabelText, queryByLabelText } =
            renderWithProviders(<DatabricksForm />);

        expect(
            await findByRole('button', { name: /sign in with databricks/i }),
        ).toBeDefined();
        expect(queryByLabelText(/personal access token/i)).toBeNull();

        await userEvent.click(
            await findByRole('textbox', { name: /authentication type/i }),
        );
        await userEvent.click(
            await findByRole('option', { name: /personal access token/i }),
        );

        expect(await findByLabelText(/personal access token/i)).toBeDefined();
    });
});
