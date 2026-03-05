import {
    getItemId,
    getItemLabelWithoutTableName,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    MapChartLocation,
    MapChartType,
} from '@lightdash/common';
import {
    Group,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import { memo, useEffect, useMemo, type FC } from 'react';
import {
    findMatchingProperty,
    useGeoJsonProperties,
} from '../../../hooks/useGeoJsonProperties';
import FieldSelect from '../../common/FieldSelect';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import MapFieldConfiguration from './MapFieldConfiguration';

// Get the label and description for the region field based on map type
const getRegionFieldConfig = (
    mapType: MapChartLocation | undefined,
): { label: string; description: string } => {
    switch (mapType) {
        case MapChartLocation.USA:
            return {
                label: 'State field',
                description: 'Field containing state codes (e.g., "CA", "NY")',
            };
        case MapChartLocation.CUSTOM:
            return {
                label: 'Data join field',
                description:
                    'Field containing values that match the selected map join field',
            };
        case MapChartLocation.WORLD:
        default:
            return {
                label: 'Country code field (ISO3)',
                description:
                    'Field containing ISO 3166-1 alpha-3 codes (e.g., "USA", "GBR")',
            };
    }
};

// Auto-detect a location field based on map type
const findLocationField = (
    itemsMap: Record<string, any> | undefined,
    mapType: MapChartLocation | undefined,
): string | undefined => {
    if (!itemsMap) return undefined;

    const items = Object.entries(itemsMap);

    // Define patterns to look for based on map type
    const patterns =
        mapType === MapChartLocation.USA
            ? ['state_code', 'statecode', 'state']
            : ['iso3', 'country', 'country_code', 'countrycode'];

    for (const pattern of patterns) {
        const match = items.find(([_, item]) => {
            const name = (
                'label' in item
                    ? item.label
                    : 'displayName' in item
                      ? item.displayName
                      : 'name' in item
                        ? item.name
                        : ''
            ).toLowerCase();
            return name.includes(pattern);
        });
        if (match) return match[0];
    }
    return undefined;
};

export const Layout: FC = memo(() => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    const isMapConfig = isMapVisualizationConfig(visualizationConfig);

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

    // Extract chart config for use in hooks (before early return)
    const chartConfig = useMemo(
        () => (isMapConfig ? visualizationConfig.chartConfig : null),
        [isMapConfig, visualizationConfig.chartConfig],
    );

    // Build proxied URL for custom GeoJSON (for fetching properties)
    const proxiedGeoJsonUrl = useMemo(() => {
        if (!chartConfig) return null;
        const { mapType, customGeoJsonUrl } = chartConfig.validConfig;
        if (mapType !== MapChartLocation.CUSTOM || !customGeoJsonUrl) {
            return null;
        }

        const isExternalUrl =
            customGeoJsonUrl.startsWith('http://') ||
            customGeoJsonUrl.startsWith('https://');

        if (isExternalUrl) {
            return `/api/v1/geojson-proxy?url=${encodeURIComponent(
                customGeoJsonUrl,
            )}`;
        }
        return customGeoJsonUrl; // Local path
    }, [chartConfig]);

    // Fetch GeoJSON properties for custom maps
    const {
        data: geoJsonPropertiesData,
        isLoading: isLoadingProperties,
        error: propertiesError,
    } = useGeoJsonProperties(proxiedGeoJsonUrl);

    // Property options for Select dropdown
    const propertyOptions = useMemo(() => {
        if (!geoJsonPropertiesData?.properties) return [];
        return geoJsonPropertiesData.properties.map((prop) => ({
            value: prop,
            label: prop,
        }));
    }, [geoJsonPropertiesData]);

    // Extract chart config values (only valid when isMapConfig is true)
    const validConfig = chartConfig?.validConfig;
    const setLocationFieldId = chartConfig?.setLocationFieldId;
    const setGeoJsonPropertyKey = chartConfig?.setGeoJsonPropertyKey;

    // Auto-fill location field when map type changes (only if not already set)
    useEffect(() => {
        if (
            !validConfig ||
            !setLocationFieldId ||
            !setGeoJsonPropertyKey ||
            !itemsMap
        ) {
            return;
        }

        if (
            validConfig.locationType === MapChartType.AREA &&
            !validConfig.locationFieldId
        ) {
            const autoField = findLocationField(itemsMap, validConfig.mapType);
            if (autoField) {
                setLocationFieldId(autoField);
                // Also set the appropriate geoJsonPropertyKey based on map type
                if (validConfig.mapType === MapChartLocation.USA) {
                    setGeoJsonPropertyKey('code');
                } else {
                    // World map uses ISO3 by default
                    setGeoJsonPropertyKey('ISO3166-1-Alpha-3');
                }
            }
        }
    }, [validConfig, itemsMap, setLocationFieldId, setGeoJsonPropertyKey]);

    // Get the label for locationFieldId (for auto-matching property to column)
    const locationFieldLabel = useMemo(() => {
        if (!validConfig?.locationFieldId || !itemsMap) return undefined;
        const item = itemsMap[validConfig.locationFieldId];
        if (!item) return undefined;
        return 'label' in item
            ? item.label
            : 'displayName' in item
              ? item.displayName
              : 'name' in item
                ? (item as { name: string }).name
                : undefined;
    }, [validConfig?.locationFieldId, itemsMap]);

    // Auto-fill geoJsonPropertyKey when custom GeoJSON properties are loaded
    useEffect(() => {
        if (
            !validConfig ||
            !setGeoJsonPropertyKey ||
            !geoJsonPropertiesData ||
            validConfig.mapType !== MapChartLocation.CUSTOM ||
            validConfig.geoJsonPropertyKey // Already set, don't override
        ) {
            return;
        }

        const { properties, suggestedProperty } = geoJsonPropertiesData;

        // Try to match the selected location column name to a property
        const matchedProperty = findMatchingProperty(
            properties,
            locationFieldLabel,
        );

        if (matchedProperty) {
            setGeoJsonPropertyKey(matchedProperty);
        } else if (suggestedProperty) {
            setGeoJsonPropertyKey(suggestedProperty);
        }
    }, [
        validConfig,
        geoJsonPropertiesData,
        locationFieldLabel,
        setGeoJsonPropertyKey,
    ]);

    if (!isMapConfig || !chartConfig) {
        return null;
    }

    const { latitudeFieldId, longitudeFieldId } = chartConfig.validConfig;

    const {
        validConfig: config,
        setMapType,
        setCustomGeoJsonUrl,
        setLocationType,
        setLatitudeFieldId,
        setLongitudeFieldId,
        setLocationFieldId: setLocationField,
    } = chartConfig;

    const mapTypeOptions = [
        { value: MapChartLocation.WORLD, label: 'World' },
        { value: MapChartLocation.USA, label: 'US' },
    ];

    // Get region field config based on map type
    const regionFieldConfig = getRegionFieldConfig(config.mapType);

    const locationTypeOptions = [
        { value: MapChartType.SCATTER, label: 'Scatter' },
        { value: MapChartType.AREA, label: 'Area' },
        { value: MapChartType.HEATMAP, label: 'Heatmap' },
    ];

    const locationType = config.locationType || MapChartType.SCATTER;
    const isCustomMap = config.mapType === MapChartLocation.CUSTOM;

    // Get selected field objects
    const latitudeField = itemsMap
        ? config.latitudeFieldId
            ? itemsMap[config.latitudeFieldId]
            : undefined
        : undefined;
    const longitudeField = itemsMap
        ? config.longitudeFieldId
            ? itemsMap[config.longitudeFieldId]
            : undefined
        : undefined;
    const locationField = itemsMap
        ? config.locationFieldId
            ? itemsMap[config.locationFieldId]
            : undefined
        : undefined;

    // Show Values section for scatter and area maps (not heatmap)
    const showValuesSection =
        locationType === MapChartType.SCATTER ||
        locationType === MapChartType.AREA;

    // Helper to check if a field looks like a lat/lon field by its label
    const isLatLonField = (fieldId: string): boolean => {
        // First check if it's the selected lat/lon field
        if (fieldId === latitudeFieldId || fieldId === longitudeFieldId) {
            return true;
        }
        // Then check by label pattern
        const item = itemsMap?.[fieldId];
        if (!item) return false;
        const label = getItemLabelWithoutTableName(item).toLowerCase();
        return (
            label === 'lat' ||
            label === 'latitude' ||
            label === 'lon' ||
            label === 'long' ||
            label === 'longitude'
        );
    };

    // Get field IDs for Values section, excluding lat/lon fields
    const valueFieldIds = itemsMap
        ? Object.keys(itemsMap).filter((fieldId) => !isLatLonField(fieldId))
        : [];

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
                                <>
                                    <TextInput
                                        label="Custom GeoJSON URL"
                                        placeholder="https://example.com/map.geojson"
                                        value={config.customGeoJsonUrl || ''}
                                        onChange={(e) =>
                                            setCustomGeoJsonUrl(
                                                e.currentTarget.value ||
                                                    undefined,
                                            )
                                        }
                                    />
                                    <Select
                                        label="Map join field"
                                        description="Property from geojson file to join on"
                                        placeholder={
                                            !config.customGeoJsonUrl
                                                ? 'Enter URL first'
                                                : isLoadingProperties
                                                  ? 'Loading...'
                                                  : propertyOptions.length === 0
                                                    ? 'No properties found'
                                                    : 'Select property'
                                        }
                                        data={propertyOptions}
                                        value={
                                            config.geoJsonPropertyKey || null
                                        }
                                        onChange={(value) =>
                                            setGeoJsonPropertyKey?.(
                                                value || undefined,
                                            )
                                        }
                                        disabled={
                                            !config.customGeoJsonUrl ||
                                            isLoadingProperties ||
                                            propertyOptions.length === 0
                                        }
                                        error={
                                            propertiesError
                                                ? `Failed to load: ${propertiesError.message}`
                                                : undefined
                                        }
                                        rightSection={
                                            isLoadingProperties ? (
                                                <Loader size="xs" />
                                            ) : undefined
                                        }
                                        clearable
                                        searchable
                                    />
                                </>
                            ) : (
                                <Select
                                    label="Map region"
                                    disabled={isCustomMap}
                                    data={mapTypeOptions}
                                    value={
                                        config.mapType || MapChartLocation.WORLD
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
                                label={regionFieldConfig.label}
                                placeholder="Select field"
                                item={locationField}
                                items={availableFields}
                                description={regionFieldConfig.description}
                                onChange={(newField) =>
                                    setLocationField(
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

            {showValuesSection && valueFieldIds.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Values</Config.Heading>
                        {valueFieldIds.map((fieldId) => (
                            <MapFieldConfiguration
                                key={fieldId}
                                fieldId={fieldId}
                            />
                        ))}
                    </Config.Section>
                </Config>
            )}
        </Stack>
    );
});
