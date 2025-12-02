import {
    getItemId,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    MapChartLocation,
    MapChartType,
} from '@lightdash/common';
import {
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';

export const Layout: FC = memo(() => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    // Get all available fields for selection (dimensions, metrics, and table calculations)
    const availableFields = useMemo(() => {
        if (!itemsMap) return [];

        return Object.values(itemsMap).filter(
            (item) =>
                isDimension(item) ||
                isCustomDimension(item) ||
                isMetric(item) ||
                isTableCalculation(item),
        );
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
        { value: MapChartLocation.USA, label: 'US' },
    ];

    const locationTypeOptions = [
        {
            value: MapChartType.SCATTER,
            label: 'Scatter',
        },
        { value: MapChartType.HEATMAP, label: 'Heatmap' },
        { value: MapChartType.AREA, label: 'Area' },
    ];

    const locationType = validConfig.locationType || MapChartType.SCATTER;
    const isCustomMap = validConfig.mapType === MapChartLocation.CUSTOM;

    // Get selected field objects
    const latitudeField = itemsMap
        ? validConfig.latitudeFieldId
            ? itemsMap[validConfig.latitudeFieldId]
            : undefined
        : undefined;
    const longitudeField = itemsMap
        ? validConfig.longitudeFieldId
            ? itemsMap[validConfig.longitudeFieldId]
            : undefined
        : undefined;
    const locationField = itemsMap
        ? validConfig.locationFieldId
            ? itemsMap[validConfig.locationFieldId]
            : undefined
        : undefined;
    const valueField = itemsMap
        ? validConfig.valueFieldId
            ? itemsMap[validConfig.valueFieldId]
            : undefined
        : undefined;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Map Type</Config.Heading>
                    <SegmentedControl
                        data={locationTypeOptions}
                        value={locationType}
                        onChange={(value) =>
                            setLocationType(
                                (value as MapChartType) || undefined,
                            )
                        }
                        fullWidth
                    />
                </Config.Section>
            </Config>

            {(locationType === MapChartType.SCATTER ||
                locationType === MapChartType.HEATMAP) && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Coordinates</Config.Heading>
                        <Group spacing="md" grow>
                            <FieldSelect
                                label="Latitude"
                                placeholder="Select field"
                                item={latitudeField}
                                items={availableFields}
                                onChange={(newField) =>
                                    setLatitudeFieldId(
                                        newField
                                            ? getItemId(newField)
                                            : undefined,
                                    )
                                }
                                hasGrouping
                                clearable
                            />
                            <FieldSelect
                                label="Longitude"
                                placeholder="Select field"
                                item={longitudeField}
                                items={availableFields}
                                onChange={(newField) =>
                                    setLongitudeFieldId(
                                        newField
                                            ? getItemId(newField)
                                            : undefined,
                                    )
                                }
                                hasGrouping
                                clearable
                            />
                        </Group>
                    </Config.Section>
                </Config>
            )}

            {locationType === MapChartType.AREA && (
                <>
                    <Config>
                        <Config.Section>
                            <Config.Heading>Location</Config.Heading>

                            <Switch
                                label="Custom region"
                                checked={isCustomMap}
                                onChange={(e) => {
                                    if (e.currentTarget.checked) {
                                        setMapType(MapChartLocation.CUSTOM);
                                    } else {
                                        setMapType(MapChartLocation.WORLD);
                                        setCustomGeoJsonUrl(undefined);
                                    }
                                }}
                            />

                            {isCustomMap ? (
                                <TextInput
                                    label="Map URL"
                                    placeholder="https://example.com/map.json"
                                    value={validConfig.customGeoJsonUrl || ''}
                                    onChange={(e) =>
                                        setCustomGeoJsonUrl(
                                            e.currentTarget.value || undefined,
                                        )
                                    }
                                />
                            ) : (
                                <Select
                                    label="Map region"
                                    disabled={isCustomMap}
                                    data={mapTypeOptions}
                                    value={
                                        validConfig.mapType ||
                                        MapChartLocation.WORLD
                                    }
                                    onChange={(value) =>
                                        setMapType(
                                            (value as MapChartLocation) ||
                                                undefined,
                                        )
                                    }
                                />
                            )}
                        </Config.Section>
                    </Config>

                    <Config>
                        <Config.Section>
                            <FieldSelect
                                label="Region field"
                                placeholder="Select field"
                                item={locationField}
                                items={availableFields}
                                onChange={(newField) =>
                                    setLocationFieldId(
                                        newField
                                            ? getItemId(newField)
                                            : undefined,
                                    )
                                }
                                hasGrouping
                                clearable
                            />
                        </Config.Section>
                    </Config>
                </>
            )}

            <Config>
                <Config.Section>
                    <Config.Heading>Value</Config.Heading>
                    <FieldSelect
                        label="Value field (optional)"
                        placeholder="Select field"
                        item={valueField}
                        items={availableFields}
                        onChange={(newField) =>
                            setValueFieldId(
                                newField ? getItemId(newField) : undefined,
                            )
                        }
                        hasGrouping
                        clearable
                    />
                </Config.Section>
            </Config>
        </Stack>
    );
});
