import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { useForm } from '@mantine/form';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { getDefaultDatabricksAuthenticationType } from './utils';
import { WarehouseFormInputs } from './WarehouseFormInputs';

let isDatabricksSsoEnabled = false;
let isSnowflakeSsoEnabled = false;

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            siteUrl: 'http://localhost:3000',
            auth: {
                databricks: { enabled: isDatabricksSsoEnabled },
                snowflake: { enabled: isSnowflakeSsoEnabled },
            },
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
                authenticationType: getDefaultDatabricksAuthenticationType(
                    isDatabricksSsoEnabled,
                ),
            },
        },
    });

    return (
        <WarehouseFormInputs form={form} disabled={false} onClose={vi.fn()} />
    );
};

const SnowflakeForm: FC = () => {
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: 'my snowflake',
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                user: '',
                password: '',
            },
        },
    });

    return (
        <WarehouseFormInputs form={form} disabled={false} onClose={vi.fn()} />
    );
};

describe('WarehouseFormInputs - Snowflake', () => {
    beforeEach(() => {
        isSnowflakeSsoEnabled = false;
    });

    it('offers password and private key authentication without Snowflake SSO', async () => {
        const { findByLabelText, findByRole, findAllByText, queryByRole } =
            renderWithProviders(<SnowflakeForm />);

        expect(await findByLabelText(/username\/email/i)).toBeDefined();
        expect((await findAllByText(/^password$/i)).length).toBeGreaterThan(0);
        expect(
            queryByRole('button', { name: /sign in with snowflake/i }),
        ).toBeNull();

        await userEvent.click(
            await findByRole('textbox', { name: /authentication type/i }),
        );
        expect(
            queryByRole('option', { name: /sign in with snowflake/i }),
        ).toBeNull();
        await userEvent.click(
            await findByRole('option', { name: /private key/i }),
        );

        expect(await findByLabelText(/private key file/i)).toBeDefined();
        expect(await findByLabelText(/private key passphrase/i)).toBeDefined();
    });

    it('offers Snowflake sign-in alongside password and private key when SSO is enabled', async () => {
        isSnowflakeSsoEnabled = true;
        const { findByRole } = renderWithProviders(<SnowflakeForm />);

        await userEvent.click(
            await findByRole('textbox', { name: /authentication type/i }),
        );
        expect(
            await findByRole('option', { name: /private key/i }),
        ).toBeDefined();
        expect(await findByRole('option', { name: /password/i })).toBeDefined();
        await userEvent.click(
            await findByRole('option', { name: /sign in with snowflake/i }),
        );

        expect(
            await findByRole('button', { name: /sign in with snowflake/i }),
        ).toBeDefined();
    });
});

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
