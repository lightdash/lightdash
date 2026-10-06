import {
    renderProvisioningOperation,
    SnowflakeAuthenticationType,
    type AiIdentityProvisioningOperation,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { SnowflakeWarehouseClient } from '@lightdash/warehouses';

export type SnowflakeProvisionerRow = Record<string, unknown>;

export class ProvisionerConnection {
    private readonly client: SnowflakeWarehouseClient;

    constructor(
        projectCredentials: CreateSnowflakeCredentials,
        userName: string,
        roleName: string | null,
        privateKey: string,
        private readonly context: {
            mappedRoles: ReadonlySet<string>;
            lightdashCreatedUsers: Set<string>;
        },
    ) {
        this.client = new SnowflakeWarehouseClient({
            ...projectCredentials,
            database: '',
            schema: '',
            warehouse: '',
            user: userName,
            role: roleName ?? undefined,
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            privateKey,
            privateKeyPass: undefined,
            password: undefined,
            token: undefined,
            refreshToken: undefined,
            requireUserCredentials: false,
            requireAgentSession: false,
            expectedCurrentUser: userName,
        });
    }

    async currentIdentity(): Promise<{ user: string; role: string }> {
        const result = await this.client.runQuery(
            'SELECT CURRENT_USER() AS CURRENT_USER, CURRENT_ROLE() AS CURRENT_ROLE',
        );
        return {
            user: String(result.rows[0]?.CURRENT_USER ?? ''),
            role: String(result.rows[0]?.CURRENT_ROLE ?? ''),
        };
    }

    async grantsToRole(roleName: string): Promise<SnowflakeProvisionerRow[]> {
        if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(roleName))
            throw new Error('Invalid provisioner role name');
        const result = await this.client.runQuery(
            `SHOW GRANTS TO ROLE ${roleName}`,
        );
        return result.rows;
    }

    async users(): Promise<SnowflakeProvisionerRow[]> {
        const result = await this.client.runQuery('SHOW USERS');
        return result.rows;
    }

    async execute(operation: AiIdentityProvisioningOperation): Promise<string> {
        const sql = renderProvisioningOperation(operation, this.context);
        await this.client.runQuery(sql);
        if (operation.kind === 'create_user')
            this.context.lightdashCreatedUsers.add(operation.userName);
        if (operation.kind === 'drop_user')
            this.context.lightdashCreatedUsers.delete(operation.userName);
        return sql;
    }
}
