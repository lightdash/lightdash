import {
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { Button, Group, Menu, Text } from '@mantine/core';
import {
    IconCheck,
    IconChevronDown,
    IconPlugConnected,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from './ConnectionHeader.module.css';

const WAREHOUSE_LABELS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.POSTGRES]: 'PostgreSQL',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
    [WarehouseTypes.TRINO]: 'Trino',
    [WarehouseTypes.CLICKHOUSE]: 'ClickHouse',
    [WarehouseTypes.ATHENA]: 'Athena',
    [WarehouseTypes.DUCKDB]: 'DuckDB',
};

const ConnectionLabel: FC<{
    name: string;
    warehouseType: WarehouseTypes | null;
}> = ({ name, warehouseType }) => (
    <Group gap={4} wrap="nowrap" miw={0}>
        <Text fz="sm" fw={500} truncate>
            {name}
        </Text>
        {warehouseType && (
            <Text fz="xs" c="dimmed" flex="0 0 auto">
                · {WAREHOUSE_LABELS[warehouseType]}
            </Text>
        )}
    </Group>
);

type Props = {
    name: string;
    warehouseType: WarehouseTypes | null;
    connections: {
        items: SqlRunnerWarehouseConnection[];
        activeUuid: string | undefined;
        onSwitch: (warehouseConnectionUuid: string) => void;
    } | null;
};

// Names the warehouse the tree below browses; a picker when there is a choice
export const ConnectionHeader: FC<Props> = ({
    name,
    warehouseType,
    connections,
}) => {
    if (!connections || connections.items.length < 2) {
        return (
            <Group gap="xs" wrap="nowrap" className={styles.root}>
                <MantineIcon icon={IconPlugConnected} color="dimmed" />
                <ConnectionLabel name={name} warehouseType={warehouseType} />
            </Group>
        );
    }

    return (
        <Menu position="bottom-start" width="target">
            <Menu.Target>
                <Button
                    variant="default"
                    size="sm"
                    fullWidth
                    justify="space-between"
                    aria-label="Active connection"
                    leftSection={
                        <MantineIcon icon={IconPlugConnected} color="dimmed" />
                    }
                    rightSection={
                        <MantineIcon icon={IconChevronDown} color="dimmed" />
                    }
                >
                    <ConnectionLabel
                        name={name}
                        warehouseType={warehouseType}
                    />
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {connections.items.map((connection) => (
                    <Menu.Item
                        key={connection.warehouseConnectionUuid}
                        onClick={() =>
                            connections.onSwitch(
                                connection.warehouseConnectionUuid,
                            )
                        }
                        rightSection={
                            connection.warehouseConnectionUuid ===
                            connections.activeUuid ? (
                                <MantineIcon icon={IconCheck} />
                            ) : null
                        }
                    >
                        <ConnectionLabel
                            name={connection.name}
                            warehouseType={connection.warehouseType}
                        />
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
