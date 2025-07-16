import { assertUnreachable, WarehouseTypes } from '@lightdash/common';
import { Avatar } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import MantineIcon from '../../common/MantineIcon';
import {
    OtherWarehouse,
    type SelectedWarehouse,
    type WarehouseLabel,
} from './types';

// assets
import BigQuery from './Assets/bigquery.svg';
import Databricks from './Assets/databricks.svg';
import PostgressLogo from './Assets/postgresql.svg';
import Redshift from './Assets/redshift.svg';
import Snowflake from './Assets/snowflake.svg';
import Trino from './Assets/trino.svg';

export const WarehouseTypeLabels: WarehouseLabel[] = [
    {
        label: 'BigQuery',
        key: WarehouseTypes.BIGQUERY,
        iconType: 'image',
        image: BigQuery,
    },
    {
        label: 'Trino',
        key: WarehouseTypes.TRINO,
        iconType: 'image',
        image: Trino,
    },
    {
        label: 'Databricks',
        key: WarehouseTypes.DATABRICKS,
        iconType: 'image',
        image: Databricks,
    },
    {
        label: 'PostgreSQL',
        key: WarehouseTypes.POSTGRES,
        iconType: 'image',
        image: PostgressLogo,
    },
    {
        label: 'Redshift',
        key: WarehouseTypes.REDSHIFT,
        iconType: 'image',
        image: Redshift,
    },
    {
        label: 'Snowflake',
        key: WarehouseTypes.SNOWFLAKE,
        iconType: 'image',
        image: Snowflake,
    },
    {
        label: 'Other',
        key: OtherWarehouse.Other,
        iconType: 'icon',
        Icon: IconDots,
    },
];

export const getWarehouseLabel = (key?: SelectedWarehouse) => {
    return WarehouseTypeLabels.find((w) => w.key === key)?.label ?? null;
};

export const getWarehouseIcon = (key?: SelectedWarehouse, size = 'md') => {
    const item = WarehouseTypeLabels.find((w) => w.key === key);
    if (!item) return null;

    switch (item.iconType) {
        case 'image':
            return <Avatar size={size} src={item.image} alt={item.label} />;
        case 'icon':
            return (
                <Avatar radius="xl" size={size} bg="transparent">
                    <MantineIcon size={size} icon={item.Icon} />
                </Avatar>
            );
        default:
            return assertUnreachable(item, 'Unknown icon type');
    }
};
