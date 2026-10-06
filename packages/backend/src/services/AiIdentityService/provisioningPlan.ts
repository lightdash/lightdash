import {
    AiIdentityProvisionerFindingReason,
    renderProvisioningOperation,
    type AiIdentity,
    type AiIdentityProvisionerFinding,
    type AiIdentityProvisioningPlan,
    type AiIdentityRoleMapping,
    type AiIdentityUserProvisioningOperation,
} from '@lightdash/common';
import type { SnowflakeProvisionerRow } from './provisionerConnection';

type ProvisioningIdentity = AiIdentity & {
    createdByProvisioner: boolean;
    provisionedRole: string | null;
    provisionedUserName: string | null;
    provisionedPublicKeyFingerprint: string | null;
    groupUuids: string[];
};

const value = (row: SnowflakeProvisionerRow, field: string): string =>
    String(row[field] ?? row[field.toUpperCase()] ?? '');

export const missingProvisionerGrants = (
    rows: SnowflakeProvisionerRow[],
    aiRoles: ReadonlySet<string>,
): string[] => {
    const has = (
        privilege: string,
        grantedOn: string,
        name?: string,
    ): boolean =>
        rows.some(
            (row) =>
                value(row, 'privilege').toUpperCase() === privilege &&
                value(row, 'granted_on').toUpperCase() === grantedOn &&
                (name === undefined ||
                    value(row, 'name').toUpperCase() === name.toUpperCase()),
        );
    return [
        ...(has('CREATE USER', 'ACCOUNT')
            ? []
            : ['CREATE USER on the account']),
        ...[...aiRoles]
            .filter((role) => !has('OWNERSHIP', 'ROLE', role))
            .map((role) => `OWNERSHIP on AI role ${role}`),
    ];
};

export const missingSchemas = (
    allowed: readonly string[],
    visible: readonly string[],
): string[] => {
    const visibleNames = new Set(visible.map((schema) => schema.toUpperCase()));
    return allowed.filter((schema) => !visibleNames.has(schema.toUpperCase()));
};

export const classifyProvisionerUsers = (
    rows: SnowflakeProvisionerRow[],
    provisionerRole: string,
    lightdashCreatedUsers: ReadonlySet<string>,
): AiIdentityProvisionerFinding[] =>
    rows.flatMap((row) => {
        const userName = value(row, 'name');
        if (value(row, 'owner').toUpperCase() !== provisionerRole.toUpperCase())
            return [];
        const userType = value(row, 'type') || null;
        const reasons: AiIdentityProvisionerFindingReason[] = [];
        if (userType?.toUpperCase() !== 'SERVICE_AGENT')
            reasons.push(AiIdentityProvisionerFindingReason.NOT_SERVICE_AGENT);
        if (
            ![...lightdashCreatedUsers].some(
                (created) => created.toUpperCase() === userName.toUpperCase(),
            )
        )
            reasons.push(
                AiIdentityProvisionerFindingReason.NOT_CREATED_BY_LIGHTDASH,
            );
        const safeName = `"${userName.replace(/"/g, '""')}"`;
        return reasons.map((reason) => ({
            userName,
            userType,
            reason,
            fixSql: `DROP USER ${safeName};\n-- or keep it: GRANT OWNERSHIP ON USER ${safeName} TO ROLE <your admin role> COPY CURRENT GRANTS;`,
        }));
    });

export const buildProvisioningPlan = ({
    identities,
    scopedUserUuids,
    mappings,
    pendingDrops,
}: {
    identities: ProvisioningIdentity[];
    scopedUserUuids: ReadonlySet<string>;
    mappings: AiIdentityRoleMapping[];
    pendingDrops: { uuid: string; userName: string }[];
}): AiIdentityProvisioningPlan => {
    const mappedRoles = new Set(mappings.map((mapping) => mapping.aiRole));
    const createdUsers = new Set([
        ...identities
            .filter((identity) => identity.createdByProvisioner)
            .map((identity) => identity.provisionedUserName)
            .filter((name): name is string => name !== null),
        ...pendingDrops.map((drop) => drop.userName),
    ]);
    const items: AiIdentityProvisioningPlan['items'] = [];
    const skipped: AiIdentityProvisioningPlan['skipped'] = [];
    const add = (
        identity: ProvisioningIdentity | null,
        operation: AiIdentityUserProvisioningOperation,
    ): void => {
        const sql = renderProvisioningOperation(operation, {
            mappedRoles,
            lightdashCreatedUsers: createdUsers,
        });
        items.push({
            aiIdentityUuid: identity?.aiIdentityUuid ?? null,
            email: identity?.email ?? null,
            firstName: identity?.firstName,
            lastName: identity?.lastName,
            operation,
            sql,
        });
        if (operation.kind === 'create_user')
            createdUsers.add(operation.userName);
        if (operation.kind === 'drop_user')
            createdUsers.delete(operation.userName);
    };
    for (const drop of pendingDrops)
        add(null, { kind: 'drop_user', userName: drop.userName });
    identities.forEach((identity) => {
        const mapping = mappings
            .filter((item) => identity.groupUuids.includes(item.groupUuid))
            .sort(
                (a, b) =>
                    a.priority - b.priority ||
                    a.groupUuid.localeCompare(b.groupUuid),
            )[0];
        const inScope = scopedUserUuids.has(identity.userUuid);
        const desiredRole = inScope ? (mapping?.aiRole ?? null) : null;
        const desiredName = identity.twinName;
        const recreate =
            identity.createdByProvisioner &&
            identity.provisionedRole !== null &&
            identity.provisionedRole !== desiredRole &&
            !mappedRoles.has(identity.provisionedRole);
        if (
            identity.createdByProvisioner &&
            identity.provisionedUserName !== null &&
            (desiredRole === null ||
                desiredName !== identity.provisionedUserName ||
                recreate)
        ) {
            add(identity, {
                kind: 'drop_user',
                userName: identity.provisionedUserName,
            });
        }
        if (!inScope) return;
        if (desiredName === null) {
            skipped.push({
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
                reason: 'no Snowflake login recorded; ask them to sign in to Snowflake or set an AI identity name',
            });
            return;
        }
        if (desiredRole === null) {
            skipped.push({
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
                reason: 'no group mapped to an AI role',
            });
            return;
        }
        if (identity.publicKey === null) {
            skipped.push({
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
                reason: 'no AI identity public key is available',
            });
            return;
        }
        if (
            !identity.createdByProvisioner ||
            identity.provisionedUserName !== desiredName ||
            recreate
        ) {
            add(identity, {
                kind: 'create_user',
                userName: desiredName,
                publicKey: identity.publicKey,
                defaultRole: desiredRole,
                comment: `Lightdash AI user for ${identity.email}`,
            });
            add(identity, {
                kind: 'grant_role',
                userName: desiredName,
                role: desiredRole,
            });
            return;
        }
        if (identity.provisionedRole !== desiredRole) {
            if (
                identity.provisionedRole !== null &&
                mappedRoles.has(identity.provisionedRole)
            )
                add(identity, {
                    kind: 'revoke_role',
                    userName: desiredName,
                    role: identity.provisionedRole,
                });
            add(identity, {
                kind: 'grant_role',
                userName: desiredName,
                role: desiredRole,
            });
            add(identity, {
                kind: 'set_default_role',
                userName: desiredName,
                role: desiredRole,
            });
        }
        if (
            identity.provisionedPublicKeyFingerprint !==
            identity.publicKeyFingerprint
        ) {
            add(identity, {
                kind: 'set_public_key',
                userName: desiredName,
                publicKey: identity.publicKey,
            });
        }
    });
    return { items, skipped };
};
