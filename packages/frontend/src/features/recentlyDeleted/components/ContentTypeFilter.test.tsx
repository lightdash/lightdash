import { ContentType, FeatureFlags } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContentTypeFilter } from './ContentTypeFilter';

const defaults = {
    dataAppsEnabled: false,
    chartTypesEnabled: false,
};
const mocks = vi.hoisted(() => ({
    dataAppsEnabled: false,
    chartTypesEnabled: false,
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: {
            enabled:
                flag === FeatureFlags.EnableDataApps && mocks.dataAppsEnabled,
        },
        isError: false,
    }),
}));

beforeEach(() => {
    Object.assign(mocks, defaults);
});
vi.mock('../../chartTypes/hooks/useChartTypesEnabled', () => ({
    useChartTypesEnabled: () => ({
        enabled: mocks.chartTypesEnabled,
        isLoading: false,
    }),
}));

describe('Recently deleted Document filter', () => {
    it('selects documents', () => {
        const onChange = vi.fn();
        render(
            <MantineProvider env="test">
                <ContentTypeFilter
                    selectedContentType="all"
                    setSelectedContentType={onChange}
                />
            </MantineProvider>,
        );
        fireEvent.click(screen.getByLabelText('Documents'));
        expect(onChange).toHaveBeenCalledWith(ContentType.DOCUMENT);
    });
});

describe('Recently deleted chart type and data app filters', () => {
    it.each([
        { dataAppsEnabled: false, chartTypesEnabled: true },
        { dataAppsEnabled: true, chartTypesEnabled: false },
        { dataAppsEnabled: false, chartTypesEnabled: false },
        { dataAppsEnabled: true, chartTypesEnabled: true },
    ])(
        'shows each filter on its own gate %j',
        ({ dataAppsEnabled, chartTypesEnabled }) => {
            Object.assign(mocks, { dataAppsEnabled, chartTypesEnabled });
            render(
                <MantineProvider env="test">
                    <ContentTypeFilter
                        selectedContentType="all"
                        setSelectedContentType={vi.fn()}
                    />
                </MantineProvider>,
            );
            expect(screen.queryByLabelText('Custom chart types') !== null).toBe(
                chartTypesEnabled,
            );
            expect(screen.queryByLabelText('Data apps') !== null).toBe(
                dataAppsEnabled,
            );
        },
    );
});
