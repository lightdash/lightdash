import {
    FeatureFlags,
    getItemId,
    getItemLabelWithoutTableName,
    MapChartLocation,
    MapChartType,
} from '@lightdash/common';
import {
    TextInput,
    Group,
    Loader,
    Stack,
    SegmentedControl,
    Select,
    Switch,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { memo, useEffect, useMemo, useState, type FC } from 'react';
import {
    selectMapAvailableFields,
    selectMapEditor,
    selectMapLatitudeFieldId,
    selectMapLongitudeFieldId,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import {
    findMatchingProperty,
    useGeoJsonProperties,
} from '../../../hooks/useGeoJsonProperties';
import { useMapEditorActions } from '../../../hooks/useMapChartConfig';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import FieldSelect from '../../common/FieldSelect';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
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

// A draft keeps typing responsive; the store gets the URL debounced
const CustomGeoJsonUrlInput: FC<{
    url: string | undefined;
    onCommit: (url: string | undefined) => void;
}> = ({ url, onCommit }) => {
    const [draft, setDraft] = useState<string>();
    const commit = useDebouncedCallback((value: string) => {
        onCommit(value || undefined);
        setDraft(undefined);
    }, { delay: 500, flushOnUnmount: true });
    return (
        <TextInput
            size="xs"
            label="Custom GeoJSON URL"
            placeholder="https://example.com/map.geojson"
            value={draft ?? url ?? ''}
            onChange={(e) => {
                setDraft(e.currentTarget.value);
                commit(e.currentTarget.value);
            }}
        />
    );
};

export const Layout: FC = memo(() => {
    const { itemsMap } = useVisualizationInputs();
    const availableFields = useVisualizationInputSelector(
        selectMapAvailableFields,
    );
    const latitudeFieldId = useVisualizationInputSelector(
        selectMapLatitudeFieldId,
    );
    const longitudeFieldId = useVisualizationInputSelector(
        selectMapLongitudeFieldId,
    );
    const mapType = useVisualizationSelector(
        (state) => selectMapEditor(state).mapType,
    );
    const customGeoJsonUrl = useVisualizationSelector(
        (state) => selectMapEditor(state).customGeoJsonUrl,
    );
    const storedLocationType = useVisualizationSelector(
        (state) => selectMapEditor(state).locationType,
    );
    const locationFieldId = useVisualizationSelector(
        (state) => selectMapEditor(state).locationFieldId,
    );
    const geoJsonPropertyKey = useVisualizationSelector(
        (state) => selectMapEditor(state).geoJsonPropertyKey,
    );
    const {
        setMapType,
        setCustomGeoJsonUrl,
        setLocationType,
        setLatitudeFieldId,
        setLongitudeFieldId,
        setLocationFieldId,
        setGeoJsonPropertyKey,
        autoFillAreaLocation,
    } = useMapEditorActions();

    const hexbinFlag = useServerFeatureFlag(FeatureFlags.HexbinMap);
    const isHexbinEnabled = hexbinFlag.data?.enabled ?? false;

    // Build proxied URL for custom GeoJSON (for fetching properties)
    const proxiedGeoJsonUrl = useMemo(() => {
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
    }, [mapType, customGeoJsonUrl]);

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

    // Editor-only auto-fill, so saved area charts render as stored
    useEffect(() => {
        if (
            !itemsMap ||
            storedLocationType !== MapChartType.AREA ||
            locationFieldId
        ) {
            return;
        }
        const autoField = findLocationField(itemsMap, mapType);
        if (autoField) {
            autoFillAreaLocation(
                autoField,
                mapType === MapChartLocation.USA ? 'code' : 'ISO3166-1-Alpha-3',
            );
        }
    }, [
        itemsMap,
        storedLocationType,
        locationFieldId,
        mapType,
        autoFillAreaLocation,
    ]);

    // Get the label for locationFieldId (for auto-matching property to column)
    const locationFieldLabel = useMemo(() => {
        if (!locationFieldId || !itemsMap) return undefined;
        const item = itemsMap[locationFieldId];
        if (!item) return undefined;
        return 'label' in item
            ? item.label
            : 'displayName' in item
              ? item.displayName
              : 'name' in item
                ? (item as { name: string }).name
                : undefined;
    }, [locationFieldId, itemsMap]);

    // Auto-fill geoJsonPropertyKey once the fetched custom GeoJSON properties land
    useEffect(() => {
        if (
            !geoJsonPropertiesData ||
            mapType !== MapChartLocation.CUSTOM ||
            geoJsonPropertyKey // Already set, don't override
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
        mapType,
        geoJsonPropertyKey,
        geoJsonPropertiesData,
        locationFieldLabel,
        setGeoJsonPropertyKey,
    ]);

    const mapTypeOptions = [
        { value: MapChartLocation.WORLD, label: 'World' },
        { value: MapChartLocation.USA, label: 'US' },
    ];

    // Get region field config based on map type
    const regionFieldConfig = getRegionFieldConfig(mapType);

    const locationType = storedLocationType || MapChartType.SCATTER;

    // Show the Hexbin option whenever either: the feature flag is enabled, the
    // flag is still loading (hides the flag fetch from the user — otherwise
    // the segmented control briefly renders with 3 items then 4, which makes
    // the active indicator slide mid-mount), or the chart already has hexbin
    // selected (so saved charts always have a matching option even if the
    // flag is off, instead of showing an empty selection).
    const showHexbinOption =
        isHexbinEnabled ||
        hexbinFlag.isLoading ||
        locationType === MapChartType.HEXBIN;

    const locationTypeOptions = [
        { value: MapChartType.SCATTER, label: 'Scatter' },
        { value: MapChartType.AREA, label: 'Area' },
        { value: MapChartType.HEATMAP, label: 'Heatmap' },
        ...(showHexbinOption
            ? [{ value: MapChartType.HEXBIN, label: 'Hexbin' }]
            : []),
    ];
    const isCustomMap = mapType === MapChartLocation.CUSTOM;

    // Get selected field objects
    const latitudeField = latitudeFieldId
        ? itemsMap?.[latitudeFieldId]
        : undefined;
    const longitudeField = longitudeFieldId
        ? itemsMap?.[longitudeFieldId]
        : undefined;
    const locationField = locationFieldId
        ? itemsMap?.[locationFieldId]
        : undefined;

    // Show Values section for scatter, area, and hexbin maps (not heatmap)
    const showValuesSection =
        locationType === MapChartType.SCATTER ||
        locationType === MapChartType.AREA ||
        locationType === MapChartType.HEXBIN;

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
                        size="xs"
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
                locationType === MapChartType.HEATMAP ||
                locationType === MapChartType.HEXBIN) && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Coordinates</Config.Heading>
                        <Group gap="md" grow>
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
                                size="xs"
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
                                    <CustomGeoJsonUrlInput
                                        url={customGeoJsonUrl}
                                        onCommit={setCustomGeoJsonUrl}
                                    />
                                    <Select
                                        label="Map join field"
                                        description="Property from geojson file to join on"
                                        placeholder={
                                            !customGeoJsonUrl
                                                ? 'Enter URL first'
                                                : isLoadingProperties
                                                  ? 'Loading...'
                                                  : propertyOptions.length === 0
                                                    ? 'No properties found'
                                                    : 'Select property'
                                        }
                                        data={propertyOptions}
                                        value={geoJsonPropertyKey || null}
                                        onChange={(value) =>
                                            setGeoJsonPropertyKey(
                                                value || undefined,
                                            )
                                        }
                                        disabled={
                                            !customGeoJsonUrl ||
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
                                    allowDeselect={false}
                                    label="Map region"
                                    disabled={isCustomMap}
                                    data={mapTypeOptions}
                                    value={mapType || MapChartLocation.WORLD}
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
