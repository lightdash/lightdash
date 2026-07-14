import { WarehouseTypes } from '@lightdash/common';
import { Button, Stack, TextInput } from '@mantine-8/core';
import { useState, type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import { useFormContext } from '../../../../components/ProjectConnection/formContext';
import { useGrantScript } from '../../hooks/useGrantScript';
import GrantScriptBlock from './GrantScriptBlock';

const HIGH_PRIVILEGE_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];

const isHighPrivilegeRole = (role: string): boolean =>
    HIGH_PRIVILEGE_ROLES.includes(role.trim().toUpperCase());

type LeastPrivilegeGuidanceProps = {
    initialRoleName?: string;
    initialDatabase?: string;
    initialWarehouse?: string;
};

const LeastPrivilegeGuidance: FC<LeastPrivilegeGuidanceProps> = ({
    initialRoleName,
    initialDatabase,
    initialWarehouse,
}) => {
    const form = useFormContext();
    const warehouse = form.values.warehouse;
    const isSnowflake = warehouse?.type === WarehouseTypes.SNOWFLAKE;

    const [roleName, setRoleName] = useState(
        initialRoleName || 'LIGHTDASH_ROLE',
    );
    const [databaseName, setDatabaseName] = useState(
        initialDatabase ?? (isSnowflake ? (warehouse.database ?? '') : ''),
    );
    const [warehouseName, setWarehouseName] = useState(
        initialWarehouse ?? (isSnowflake ? (warehouse.warehouse ?? '') : ''),
    );

    const grantScript = useGrantScript();

    const showHighPrivilegeWarning = isHighPrivilegeRole(roleName);

    return (
        <Stack gap="sm">
            <Callout variant="info" title="Least-privilege by default">
                We recommend a dedicated read-only role (e.g.{' '}
                <code>LIGHTDASH_ROLE</code>) rather than a broad admin role. Run
                the script below so the connection test passes on the first try.
            </Callout>

            <TextInput
                label="Role name"
                value={roleName}
                onChange={(e) => setRoleName(e.currentTarget.value)}
            />
            <TextInput
                label="Database"
                value={databaseName}
                onChange={(e) => setDatabaseName(e.currentTarget.value)}
            />
            <TextInput
                label="Warehouse"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.currentTarget.value)}
            />

            {showHighPrivilegeWarning && (
                <Callout variant="warning" title="High-privilege role selected">
                    <code>{roleName.toUpperCase()}</code> grants broad access.
                    We recommend a scoped read-only role instead — but you can
                    continue if you prefer.
                </Callout>
            )}

            <Button
                variant="light"
                loading={grantScript.isLoading}
                disabled={!roleName || !databaseName || !warehouseName}
                onClick={() =>
                    grantScript.mutate({
                        roleName,
                        databaseName,
                        warehouseName,
                        userName: null,
                        schemas: null,
                    })
                }
            >
                Generate grant script
            </Button>

            {grantScript.data && (
                <GrantScriptBlock sql={grantScript.data.sql} />
            )}
        </Stack>
    );
};

export default LeastPrivilegeGuidance;
