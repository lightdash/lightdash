import type L from 'leaflet';
import { useCallback, type FC } from 'react';
import { CircleMarker, Tooltip } from 'react-leaflet';
import type {
    ScatterPoint,
    TooltipFieldInfo,
} from '../../hooks/leaflet/useLeafletMapConfig';
import { getCopyValue, getFormattedValue } from './mapMarkerUtils';

// Shared props for tooltip and popup content
export type MapContentBaseProps = {
    tooltipFields: TooltipFieldInfo[];
    rowData: Record<string, any>;
    lat?: number;
    lon?: number;
    // For "no data" regions
    noData?: {
        locationLabel: string;
        locationValue: string;
    };
};

type MapTooltipContentProps = MapContentBaseProps;

// NOTE: Using inline styles because this is rendered via renderToString
// and Mantine styles won't be applied
export const MapTooltipContent: FC<MapTooltipContentProps> = ({
    tooltipFields,
    rowData,
    lat,
    lon,
    noData,
}) => {
    const visibleFields = tooltipFields.filter((f) => f.visible);

    if (noData) {
        return (
            <div style={{ padding: '4px 6px' }}>
                <div style={{ fontSize: 14 }}>
                    <strong>{noData.locationLabel}:</strong>{' '}
                    {noData.locationValue}
                </div>
                <div
                    style={{
                        fontSize: 14,
                        color: '#868e96',
                        fontStyle: 'italic',
                    }}
                >
                    No data
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '4px 6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleFields.map((field) => (
                    <div key={field.fieldId} style={{ fontSize: 14 }}>
                        <strong>{field.label}:</strong>{' '}
                        {getFormattedValue(rowData, field.fieldId)}
                    </div>
                ))}
            </div>
            {lat !== undefined && lon !== undefined && (
                <div
                    style={{
                        fontSize: 12,
                        color: '#868e96',
                        marginTop: 8,
                    }}
                >
                    Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
                </div>
            )}
        </div>
    );
};

export type MapMarkerProps = {
    point: ScatterPoint;
    radius: number;
    color: string;
    fillOpacity: number;
    tooltipFields: TooltipFieldInfo[];
    hideTooltip?: boolean;
    onClick?: (
        e: L.LeafletMouseEvent,
        rowData: Record<string, any>,
        copyValue: string,
        lat: number,
        lon: number,
    ) => void;
};

export const MapMarker: FC<MapMarkerProps> = ({
    point,
    radius,
    color,
    fillOpacity,
    tooltipFields,
    hideTooltip,
    onClick,
}) => {
    const handleClick = useCallback(
        (e: L.LeafletMouseEvent) => {
            const copyValue = getCopyValue(tooltipFields, point.rowData);
            onClick?.(e, point.rowData, copyValue, point.lat, point.lon);
        },
        [onClick, point.rowData, point.lat, point.lon, tooltipFields],
    );

    return (
        <CircleMarker
            center={[point.lat, point.lon]}
            radius={radius}
            pathOptions={{
                fillColor: color,
                color: '#fff',
                fillOpacity,
                weight: 1,
            }}
            eventHandlers={{
                click: handleClick,
                contextmenu: handleClick,
            }}
        >
            {!hideTooltip && (
                <Tooltip>
                    <MapTooltipContent
                        tooltipFields={tooltipFields}
                        rowData={point.rowData}
                        lat={point.lat}
                        lon={point.lon}
                    />
                </Tooltip>
            )}
        </CircleMarker>
    );
};
