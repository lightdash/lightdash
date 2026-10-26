import { type Knex } from 'knex';
import { z } from 'zod';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import { OrganizationTableName } from '../../database/entities/organizations';
import {
    PersonalAccessTokenTableName,
    type DbPersonalAccessToken,
} from '../../database/entities/personalAccessTokens';
import { UserTableName } from '../../database/entities/users';

export type InventoryOptions = {
    before: string;
    organizationUuid: string | null;
    format: 'json' | 'csv';
};

type InventoryRow = Pick<
    DbPersonalAccessToken,
    | 'personal_access_token_uuid'
    | 'created_at'
    | 'expires_at'
    | 'rotated_at'
    | 'last_used_at'
    | 'description'
> & {
    organization_uuid: string | null;
    user_uuid: string;
};

export const INVENTORY_NOTICE =
    'The server cannot tell which tokens were minted through OAuth. Organization membership is current, not historical. This inventory does not revoke tokens.';

const columns = [
    'personal_access_token_uuid',
    'organization_uuid',
    'user_uuid',
    'created_at',
    'expires_at',
    'rotated_at',
    'last_used_at',
    'description',
] as const;

export const parseArguments = (argv: string[]): InventoryOptions => {
    let before: string | null = null;
    let organizationUuid: string | null = null;
    let format: InventoryOptions['format'] = 'json';
    const seen = new Set<string>();
    for (let i = 0; i < argv.length; i += 2) {
        const argument = argv[i];
        if (seen.has(argument)) {
            throw new Error(`Duplicate argument: ${argument}`);
        }
        seen.add(argument);
        const value = argv[i + 1];
        switch (argument) {
            case '--before':
                if (
                    !z.string().datetime({ offset: true }).safeParse(value)
                        .success
                ) {
                    throw new Error(
                        '--before must be an ISO timestamp with a timezone',
                    );
                }
                before = new Date(value).toISOString();
                break;
            case '--organization':
                if (!z.string().uuid().safeParse(value).success) {
                    throw new Error('--organization must be a UUID');
                }
                organizationUuid = value;
                break;
            case '--format':
                if (value !== 'json' && value !== 'csv') {
                    throw new Error('--format must be json or csv');
                }
                format = value;
                break;
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (before === null) {
        throw new Error('--before is required');
    }
    return { before, organizationUuid, format };
};

export const run = async (database: Knex, options: InventoryOptions) => {
    const query = database(PersonalAccessTokenTableName)
        .join(
            UserTableName,
            `${UserTableName}.user_id`,
            `${PersonalAccessTokenTableName}.created_by_user_id`,
        )
        .leftJoin(
            OrganizationMembershipsTableName,
            `${OrganizationMembershipsTableName}.user_id`,
            `${UserTableName}.user_id`,
        )
        .leftJoin(
            OrganizationTableName,
            `${OrganizationTableName}.organization_id`,
            `${OrganizationMembershipsTableName}.organization_id`,
        )
        .select<InventoryRow[]>(
            ...columns.map((column) => {
                if (column === 'organization_uuid') {
                    return `${OrganizationTableName}.${column}`;
                }
                if (column === 'user_uuid') {
                    return `${UserTableName}.${column}`;
                }
                return `${PersonalAccessTokenTableName}.${column}`;
            }),
        )
        .where(
            `${PersonalAccessTokenTableName}.created_at`,
            '<',
            options.before,
        )
        .orderBy(`${PersonalAccessTokenTableName}.created_at`)
        .orderBy(`${PersonalAccessTokenTableName}.personal_access_token_uuid`)
        .orderBy(`${OrganizationTableName}.organization_uuid`);

    if (options.organizationUuid !== null) {
        query.where(
            `${OrganizationTableName}.organization_uuid`,
            options.organizationUuid,
        );
    }
    const rows = await query;
    return {
        notice: INVENTORY_NOTICE,
        tokens: rows.map((row) => ({
            personal_access_token_uuid: row.personal_access_token_uuid,
            organization_uuid: row.organization_uuid,
            user_uuid: row.user_uuid,
            created_at: row.created_at.toISOString(),
            expires_at: row.expires_at?.toISOString() ?? null,
            rotated_at: row.rotated_at?.toISOString() ?? null,
            last_used_at: row.last_used_at?.toISOString() ?? null,
            description: row.description,
        })),
    };
};

export type InventoryReport = Awaited<ReturnType<typeof run>>;

export const formatReport = (
    report: InventoryReport,
    format: InventoryOptions['format'],
): string => {
    if (format === 'json') return JSON.stringify(report, null, 2);
    const csvValue = (value: string | null) =>
        value === null ? '' : `"${value.replace(/"/g, '""')}"`;
    return [
        columns.join(','),
        ...report.tokens.map((token) =>
            columns.map((column) => csvValue(token[column])).join(','),
        ),
    ].join('\r\n');
};
