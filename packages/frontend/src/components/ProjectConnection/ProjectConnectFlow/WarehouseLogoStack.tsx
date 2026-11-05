import { WarehouseTypes } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type FC } from 'react';
import { getWarehouseIcon } from './utils';
import classes from './WarehouseLogoStack.module.css';

const POPULAR_WAREHOUSES = [
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.POSTGRES,
];

const ICON_SIZE = { sm: 12, md: 18 } as const;

/** Overlapping logos of the warehouses most people connect */
export const WarehouseLogoStack: FC<{
    size: keyof typeof ICON_SIZE;
    monochrome: boolean;
}> = ({ size, monochrome }) => (
    <Box
        className={classes.stack}
        data-size={size}
        data-monochrome={monochrome || undefined}
        aria-hidden
    >
        {POPULAR_WAREHOUSES.map((warehouse) => (
            <Box key={warehouse} className={classes.logo}>
                {getWarehouseIcon(warehouse, ICON_SIZE[size])}
            </Box>
        ))}
    </Box>
);
