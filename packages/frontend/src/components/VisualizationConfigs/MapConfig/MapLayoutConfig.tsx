import {
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    MapChartLocation,
    MapChartType,
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
        { value: MapChartLocation.WORLD, label: 'World' },
        { value: MapChartLocation.EUROPE, label: 'Europe' },
        { value: MapChartLocation.USA, label: 'USA' },
        { value: MapChartLocation.USA_COUNTIES, label: 'USA Counties' },
        { value: MapChartLocation.NORWAY, label: 'Norway' },
        {
            value: MapChartLocation.BEEF_CUTS,
            label: 'Beef Cuts (France) - SVG Test',
        },
        { value: MapChartLocation.CUSTOM, label: 'Custom GeoJSON URL' },
    ];

    const locationTypeOptions = [
        {
            value: MapChartType.SCATTER,
            label: 'Scatter plot',
        },
        { value: MapChartType.AREA, label: 'Area map' },
    ];

    const locationType = validConfig.locationType || MapChartType.SCATTER;

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Map Configuration</Config.Heading>

                <Select
                    label="Location"
                    description="How to specify locations on the map"
                    data={mapTypeOptions}
                    value={validConfig.mapType || MapChartLocation.WORLD}
                    onChange={(value) =>
                        setMapType((value as MapChartLocation) || undefined)
                    }
                    mb="md"
                />
                {validConfig.mapType === MapChartLocation.CUSTOM && (
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
                    label="Map Type"
                    description="Choose how data is displayed on the map"
                    data={locationTypeOptions}
                    value={locationType}
                    onChange={(value) =>
                        setLocationType((value as MapChartType) || undefined)
                    }
                    mb="md"
                />

                {locationType === MapChartType.SCATTER && (
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

                {locationType === MapChartType.AREA && (
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
