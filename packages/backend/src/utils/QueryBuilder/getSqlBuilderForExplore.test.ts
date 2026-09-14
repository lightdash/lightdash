import {
    ExploreType,
    SupportedDbtAdapter,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import { getSqlBuilderForExplore } from './getSqlBuilderForExplore';

describe('getSqlBuilderForExplore', () => {
    const postgresCredentials = {
        type: WarehouseTypes.POSTGRES,
        startOfWeek: WeekDay.MONDAY,
    };

    it('uses the DuckDB dialect for external source explores', () => {
        const builder = getSqlBuilderForExplore(
            { type: ExploreType.EXTERNAL_SOURCE },
            postgresCredentials,
        );
        expect(builder.getAdapterType()).toBe(SupportedDbtAdapter.DUCKDB);
        expect(builder.getStartOfWeek()).toBe(WeekDay.MONDAY);
    });

    it('uses the warehouse dialect for every other explore type', () => {
        expect(
            getSqlBuilderForExplore(
                { type: ExploreType.DEFAULT },
                postgresCredentials,
            ).getAdapterType(),
        ).toBe(SupportedDbtAdapter.POSTGRES);
        expect(
            getSqlBuilderForExplore(
                { type: undefined },
                postgresCredentials,
            ).getAdapterType(),
        ).toBe(SupportedDbtAdapter.POSTGRES);
        expect(
            getSqlBuilderForExplore(
                { type: ExploreType.VIRTUAL },
                postgresCredentials,
            ).getAdapterType(),
        ).toBe(SupportedDbtAdapter.POSTGRES);
    });
});
