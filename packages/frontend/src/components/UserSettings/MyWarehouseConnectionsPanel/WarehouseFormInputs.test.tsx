import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { useForm } from '@mantine/form';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { getSsoLabel } from '../../ProjectConnection/WarehouseForms/util';
import {
    getDefaultDatabricksAuthenticationType,
    getDefaultSnowflakeAuthenticationType,
    validateUserWarehouseCredentials,
} from './utils';
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

const SnowflakeForm: FC<{
    authenticationType?: SnowflakeAuthenticationType;
}> = ({ authenticationType }) => {
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: 'my snowflake',
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                user: '',
                password: '',
                authenticationType:
                    authenticationType ??
                    getDefaultSnowflakeAuthenticationType(
                        isSnowflakeSsoEnabled,
                    ),
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

    it('defaults to Snowflake sign-in when SSO is enabled', async () => {
        isSnowflakeSsoEnabled = true;
        const { findByRole } = renderWithProviders(<SnowflakeForm />);

        expect(
            await findByRole('button', { name: /sign in with snowflake/i }),
        ).toBeDefined();
    });

    it('still labels a stored SSO credential once SSO is turned off', async () => {
        const { findByRole } = renderWithProviders(
            <SnowflakeForm
                authenticationType={SnowflakeAuthenticationType.SSO}
            />,
        );

        expect(
            await findByRole('textbox', { name: /authentication type/i }),
        ).toHaveValue(getSsoLabel(WarehouseTypes.SNOWFLAKE));
    });
});

describe('validateUserWarehouseCredentials', () => {
    const credentials = (
        overrides: Partial<{
            user: string;
            privateKey: string;
            password: string;
            authenticationType: SnowflakeAuthenticationType;
        }>,
    ): UpsertUserWarehouseCredentials => ({
        name: 'my snowflake',
        credentials: {
            type: WarehouseTypes.SNOWFLAKE,
            user: 'analyst',
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            ...overrides,
        },
    });

    it('blocks saving a private key credential with no uploaded key', () => {
        expect(validateUserWarehouseCredentials(credentials({}))).toEqual({
            'credentials.privateKey': expect.any(String),
        });
    });

    it('blocks saving when the stored key was replaced by a placeholder', () => {
        expect(
            validateUserWarehouseCredentials(credentials({ privateKey: '' })),
        ).toEqual({
            'credentials.privateKey': expect.any(String),
        });
    });

    it('accepts a private key credential with an uploaded key', () => {
        expect(
            validateUserWarehouseCredentials(
                credentials({ privateKey: '-----BEGIN PRIVATE KEY-----' }),
            ),
        ).toEqual({});
    });

    it('blocks renaming a password credential without re-entering the password', () => {
        expect(
            validateUserWarehouseCredentials(
                credentials({
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    password: '',
                }),
            ),
        ).toEqual({ 'credentials.password': expect.any(String) });
    });

    it('accepts a password credential with a password', () => {
        expect(
            validateUserWarehouseCredentials(
                credentials({
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    password: 'hunter2',
                }),
            ),
        ).toEqual({});
    });

    it('flags a blank username', () => {
        expect(
            validateUserWarehouseCredentials(
                credentials({
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    user: '   ',
                    password: 'hunter2',
                }),
            ),
        ).toEqual({ 'credentials.user': expect.any(String) });
    });

    it('leaves the SSO credential to its OAuth popup', () => {
        expect(
            validateUserWarehouseCredentials(
                credentials({
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    user: '',
                }),
            ),
        ).toEqual({});
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
