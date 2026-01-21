import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';

export type GeoJsonPropertiesResult = {
    properties: string[];
    suggestedProperty: string | null;
};

/**
 * Priority order for auto-suggesting a property:
 * 1. 'name' (case-insensitive) - most common identifier
 * 2. 'code' (case-insensitive) - common for administrative regions
 * 3. 'id' (case-insensitive) - generic identifier
 * 4. First property in the list
 */
const findSuggestedProperty = (properties: string[]): string | null => {
    if (properties.length === 0) return null;

    const priorityPatterns = ['name', 'code', 'id'];

    for (const pattern of priorityPatterns) {
        const match = properties.find((prop) => prop.toLowerCase() === pattern);
        if (match) return match;
    }

    return properties[0];
};

/**
 * Extracts unique property keys from all features in a GeoJSON FeatureCollection.
 * For TopoJSON, converts to GeoJSON first.
 */
const extractPropertiesFromGeoJson = (
    data: unknown,
): GeoJsonPropertiesResult => {
    let features: GeoJSON.Feature[] = [];

    // Handle TopoJSON
    if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as { type: string }).type === 'Topology' &&
        'objects' in data
    ) {
        const topology = data as Topology;
        const objectKey = Object.keys(topology.objects)[0];
        const geoJson = topojson.feature(
            topology,
            topology.objects[objectKey],
        ) as GeoJSON.FeatureCollection;
        features = geoJson.features || [];
    }
    // Handle GeoJSON FeatureCollection
    else if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as { type: string }).type === 'FeatureCollection' &&
        'features' in data
    ) {
        features = ((data as { features: unknown[] }).features ||
            []) as GeoJSON.Feature[];
    }

    // Collect all unique property keys across all features
    const propertySet = new Set<string>();
    features.forEach((feature) => {
        if (feature.properties) {
            Object.keys(feature.properties).forEach((key) => {
                propertySet.add(key);
            });
        }
    });

    const properties = Array.from(propertySet).sort();
    const suggestedProperty = findSuggestedProperty(properties);

    return { properties, suggestedProperty };
};

/**
 * Fetches a GeoJSON URL and extracts available property keys.
 * Works with both GeoJSON and TopoJSON formats.
 */
const fetchGeoJsonProperties = async (
    geoJsonUrl: string,
): Promise<GeoJsonPropertiesResult> => {
    // Include credentials for authenticated proxy requests
    const response = await fetch(geoJsonUrl, {
        credentials: 'include',
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(
            `[useGeoJsonProperties] Failed to fetch GeoJSON: ${response.status}`,
            errorText,
        );
        throw new Error(`Failed to fetch GeoJSON: ${response.status}`);
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch (parseError) {
        console.error(
            '[useGeoJsonProperties] Failed to parse GeoJSON as JSON:',
            parseError,
        );
        throw new Error('Failed to parse GeoJSON: invalid JSON');
    }

    const result = extractPropertiesFromGeoJson(data);

    if (result.properties.length === 0) {
        console.warn(
            '[useGeoJsonProperties] No properties found in GeoJSON. Data type:',
            typeof data === 'object' && data !== null
                ? (data as { type?: string }).type
                : typeof data,
        );
    }

    return result;
};

/**
 * Hook to fetch GeoJSON properties from a URL.
 * Returns the list of available property keys and a suggested default.
 *
 * @param geoJsonUrl - The URL to fetch (can be proxied or local)
 * @param options - Additional TanStack Query options
 */
export const useGeoJsonProperties = (
    geoJsonUrl: string | null | undefined,
    options?: Omit<
        UseQueryOptions<GeoJsonPropertiesResult, Error>,
        'queryKey' | 'queryFn' | 'enabled'
    >,
) => {
    return useQuery<GeoJsonPropertiesResult, Error>({
        queryKey: ['geojson_properties', geoJsonUrl],
        queryFn: () => fetchGeoJsonProperties(geoJsonUrl!),
        enabled: !!geoJsonUrl,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1, // Only retry once for external resources
        ...options,
    });
};

/**
 * Helper to find the best matching property for a given column name.
 * Uses case-insensitive matching.
 *
 * @param properties - Available GeoJSON property keys
 * @param columnName - The data column name to match against
 * @returns The matching property or null if no match found
 */
export const findMatchingProperty = (
    properties: string[],
    columnName: string | undefined,
): string | null => {
    if (!columnName || properties.length === 0) return null;

    const normalizedColumnName = columnName.toLowerCase();

    // Exact match (case-insensitive)
    const exactMatch = properties.find(
        (prop) => prop.toLowerCase() === normalizedColumnName,
    );
    if (exactMatch) return exactMatch;

    // Partial match - column name contains property or vice versa
    const partialMatch = properties.find(
        (prop) =>
            normalizedColumnName.includes(prop.toLowerCase()) ||
            prop.toLowerCase().includes(normalizedColumnName),
    );
    if (partialMatch) return partialMatch;

    return null;
};
