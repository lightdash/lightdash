import {
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    MapChartLocationType,
    MapChartMapType,
} from '@lightdash/common';
import { Select, TextInput } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const Layout: FC = memo(() => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    // Get all available fields for selection (dimensions, metrics, and table calculations)
    const availableFields = useMemo(() => {
        if (!itemsMap) return [];

        return Object.entries(itemsMap)
            .filter(
                ([_, item]) =>
                    isDimension(item) ||
                    isCustomDimension(item) ||
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
        return null;
    }

    const {
        chartConfig: {
            validConfig,
            setMapType,
            setCustomGeoJsonUrl,
            setLocationType,
            setLatitudeFieldId,
            setLongitudeFieldId,
            setLocationFieldId,
            setValueFieldId,
        },
    } = visualizationConfig;

    const mapTypeOptions = [
        { value: MapChartMapType.WORLD, label: 'World' },
        { value: MapChartMapType.EUROPE, label: 'Europe' },
        { value: MapChartMapType.USA, label: 'USA' },
        { value: MapChartMapType.USA_COUNTIES, label: 'USA Counties' },
        { value: MapChartMapType.NORWAY, label: 'Norway' },
        {
            value: MapChartMapType.BEEF_CUTS,
            label: 'Beef Cuts (France) - SVG Test',
        },
        { value: MapChartMapType.CUSTOM, label: 'Custom GeoJSON URL' },
    ];

    const locationTypeOptions = [
        {
            value: MapChartLocationType.LAT_LONG,
            label: 'Latitude/Longitude',
        },
        { value: MapChartLocationType.REGION, label: 'Region' },
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
                {validConfig.mapType === MapChartMapType.CUSTOM && (
                    <TextInput
                        label="Custom Map URL"
                        description="URL to a GeoJSON/TopoJSON/SVG file (e.g., https://example.com/map.json or /my-map.svg)"
                        placeholder="https://example.com/map.json or /my-map.svg"
                        value={validConfig.customGeoJsonUrl || ''}
                        onChange={(e) =>
                            setCustomGeoJsonUrl(
                                e.currentTarget.value || undefined,
                            )
                        }
                        mb="md"
                    />
                )}
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

                {locationType === MapChartLocationType.REGION && (
                    <Select
                        label="Region Field"
                        description="Select the field containing region names (e.g., country names, state codes, or custom region identifiers)"
                        placeholder="Select region field"
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
