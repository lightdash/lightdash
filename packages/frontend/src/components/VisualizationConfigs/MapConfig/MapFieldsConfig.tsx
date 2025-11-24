import {
    isDimension,
    isMetric,
    isTableCalculation,
    MapChartLocationType,
    MapChartMapType,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const MapFieldsConfig: FC = memo(() => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    console.log(
        'MapFieldsConfig - visualizationConfig:',
        visualizationConfig?.chartType,
    );
    console.log(
        'MapFieldsConfig - itemsMap:',
        Object.keys(itemsMap || {}).length,
        'fields',
    );

    // Get all available fields for selection (dimensions, metrics, and table calculations)
    const availableFields = useMemo(() => {
        if (!itemsMap) return [];

        return Object.entries(itemsMap)
            .filter(
                ([_, item]) =>
                    isDimension(item) ||
                    isMetric(item) ||
                    isTableCalculation(item),
            )
            .map(([fieldId, item]) => ({
                value: fieldId,
                label:
                    'label' in item
                        ? item.label
                        : 'displayName' in item
                        ? item.displayName
                        : item.name,
            }));
    }, [itemsMap]);

    if (!isMapVisualizationConfig(visualizationConfig)) {
        console.log('MapFieldsConfig - Not a map visualization config');
        return null;
    }

    const {
        chartConfig: {
            validConfig,
            setMapType,
            setLocationType,
            setLatitudeFieldId,
            setLongitudeFieldId,
            setLocationFieldId,
            setValueFieldId,
        },
    } = visualizationConfig;

    console.log('MapFieldsConfig - availableFields:', availableFields.length);
    console.log('MapFieldsConfig - current config:', validConfig);

    const mapTypeOptions = [
        { value: MapChartMapType.WORLD, label: 'World' },
        { value: MapChartMapType.EUROPE, label: 'Europe' },
        { value: MapChartMapType.USA, label: 'USA' },
        { value: MapChartMapType.UK, label: 'United Kingdom' },
        { value: MapChartMapType.NORWAY, label: 'Norway' },
    ];

    const locationTypeOptions = [
        {
            value: MapChartLocationType.LAT_LONG,
            label: 'Latitude/Longitude',
        },
        { value: MapChartLocationType.COUNTRY, label: 'Country' },
        { value: MapChartLocationType.REGION, label: 'Region/State' },
    ];

    const locationType =
        validConfig.locationType || MapChartLocationType.LAT_LONG;

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Map Configuration</Config.Heading>
                <Select
                    label="Map Type"
                    description="Select the geographic region to display"
                    data={mapTypeOptions}
                    value={validConfig.mapType || MapChartMapType.WORLD}
                    onChange={(value) =>
                        setMapType((value as MapChartMapType) || undefined)
                    }
                    mb="md"
                />
                <Select
                    label="Location Type"
                    description="How to specify locations on the map"
                    data={locationTypeOptions}
                    value={locationType}
                    onChange={(value) =>
                        setLocationType(
                            (value as MapChartLocationType) || undefined,
                        )
                    }
                    mb="md"
                />

                {locationType === MapChartLocationType.LAT_LONG && (
                    <>
                        <Select
                            label="Latitude Field"
                            description="Select the field containing latitude values (-90 to 90)"
                            placeholder="Select latitude field"
                            data={availableFields}
                            value={validConfig.latitudeFieldId || null}
                            onChange={(value) =>
                                setLatitudeFieldId(value || undefined)
                            }
                            searchable
                            clearable
                            mb="md"
                        />
                        <Select
                            label="Longitude Field"
                            description="Select the field containing longitude values (-180 to 180)"
                            placeholder="Select longitude field"
                            data={availableFields}
                            value={validConfig.longitudeFieldId || null}
                            onChange={(value) =>
                                setLongitudeFieldId(value || undefined)
                            }
                            searchable
                            clearable
                            mb="md"
                        />
                    </>
                )}

                {(locationType === MapChartLocationType.COUNTRY ||
                    locationType === MapChartLocationType.REGION) && (
                    <Select
                        label={
                            locationType === MapChartLocationType.COUNTRY
                                ? 'Country Field'
                                : 'Region/State Field'
                        }
                        description={
                            locationType === MapChartLocationType.COUNTRY
                                ? 'Select the field containing country names or codes'
                                : 'Select the field containing region/state names or codes (e.g., US state codes)'
                        }
                        placeholder={
                            locationType === MapChartLocationType.COUNTRY
                                ? 'Select country field'
                                : 'Select region field'
                        }
                        data={availableFields}
                        value={validConfig.locationFieldId || null}
                        onChange={(value) =>
                            setLocationFieldId(value || undefined)
                        }
                        searchable
                        clearable
                        mb="md"
                    />
                )}

                <Select
                    label="Value Field (Optional)"
                    description="Select a field to determine the size/intensity of locations on the map"
                    placeholder="Select value field"
                    data={availableFields}
                    value={validConfig.valueFieldId || null}
                    onChange={(value) => setValueFieldId(value || undefined)}
                    searchable
                    clearable
                />
            </Config.Section>
        </Config>
    );
});
