import { WarehouseTypes } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { AiServiceAccountConnectionCard } from './AiServiceAccountConnectionCard';

describe('AiServiceAccountConnectionCard', () => {
    it.each([
        [WarehouseTypes.SNOWFLAKE, 'Snowflake'],
        [WarehouseTypes.BIGQUERY, 'BigQuery'],
        [WarehouseTypes.DATABRICKS, 'Databricks'],
        [WarehouseTypes.POSTGRES, 'PostgreSQL'],
        [WarehouseTypes.REDSHIFT, 'Redshift'],
        [WarehouseTypes.TRINO, 'Trino'],
        [WarehouseTypes.CLICKHOUSE, 'ClickHouse'],
        [WarehouseTypes.ATHENA, 'Athena'],
        [WarehouseTypes.DUCKDB, 'DuckDB'],
    ] as const)(
        'explains %s service access without a badge or action',
        (warehouseType, name) => {
            const { container } = renderWithProviders(
                <AiServiceAccountConnectionCard
                    warehouseType={warehouseType}
                />,
            );
            expect(screen.getByRole('heading', { name })).toBeInTheDocument();
            expect(
                screen.getByText(
                    `Agents on ${name} projects run as a shared agent account that your admin set up. They read only what that account can read. Your own access doesn't change.`,
                ),
            ).toBeInTheDocument();
            expect(screen.queryByText('Nothing to do')).not.toBeInTheDocument();
            expect(container.querySelector('.mantine-Badge-root')).toBeNull();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        },
    );
});
