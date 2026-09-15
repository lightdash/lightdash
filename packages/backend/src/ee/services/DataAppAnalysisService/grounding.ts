import type { DataAppAnomaly } from '@lightdash/common';
import { createHash } from 'crypto';
import type { DataAppDetection } from '../ai/agents/dataAppAnomalyDetector';

/**
 * What the grounding check knows about one source: which field ids exist and
 * every value each row shows for them (raw and formatted, since the model
 * copies whichever it saw).
 */
export type GroundingSource = {
    queryUuid: string;
    fieldIds: Set<string>;
    rows: Record<string, Set<string>>[];
};

export const anomalyId = (
    anomaly: Pick<DataAppAnomaly, 'queryUuid' | 'fieldId' | 'dimensionValues'>,
): string => {
    const dims = Object.keys(anomaly.dimensionValues)
        .sort()
        .map((key) => `${key}=${anomaly.dimensionValues[key]}`)
        .join('&');
    return createHash('sha1')
        .update(`${anomaly.queryUuid}|${anomaly.fieldId}|${dims}`)
        .digest('hex')
        .slice(0, 16);
};

const rowMatches = (
    row: Record<string, Set<string>>,
    dimensionValues: Record<string, string>,
): boolean =>
    Object.entries(dimensionValues).every(([fieldId, value]) =>
        row[fieldId]?.has(value),
    );

/**
 * Drops anomalies whose references do not exist in the analysed data: an
 * unknown query, a field the query did not return, or dimension values that
 * match no row. Valid JSON is not evidence; this is.
 */
export const groundAnomalies = (
    anomalies: DataAppDetection['anomalies'],
    sources: GroundingSource[],
): { anomalies: DataAppAnomaly[]; droppedCount: number } => {
    const byQuery = new Map(sources.map((s) => [s.queryUuid, s]));
    const grounded: DataAppAnomaly[] = [];
    let droppedCount = 0;

    anomalies.forEach((anomaly) => {
        const source = byQuery.get(anomaly.queryUuid);
        const dimensionIds = Object.keys(anomaly.dimensionValues);
        const referencesExist =
            source !== undefined &&
            source.fieldIds.has(anomaly.fieldId) &&
            dimensionIds.every((id) => source.fieldIds.has(id));
        const rowExists =
            referencesExist &&
            (dimensionIds.length === 0 ||
                source.rows.some((row) =>
                    rowMatches(row, anomaly.dimensionValues),
                ));
        if (!rowExists) {
            droppedCount += 1;
            return;
        }
        grounded.push({ ...anomaly, id: anomalyId(anomaly) });
    });

    return { anomalies: grounded, droppedCount };
};
