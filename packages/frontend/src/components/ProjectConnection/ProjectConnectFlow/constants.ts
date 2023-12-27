import { OtherWarehouse, WarehouseTypes } from '@lightdash/common';
import { IconDots } from '@tabler/icons-react';
import BigQuery from '../Assets/bigquery.svg';
import Databricks from '../Assets/databricks.svg';
import PostgressLogo from '../Assets/postgresql.svg';
import Redshift from '../Assets/redshift.svg';
import Snowflake from '../Assets/snowflake.svg';
import Trino from '../Assets/trino.svg';
import { WarehouseLabel } from './types';

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
