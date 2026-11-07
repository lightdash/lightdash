/**
 * The rows of the external sources page: each uploaded file or connected
 * sheet with its row count and state, by name.
 */
import {
    assertUnreachable,
    ExternalSourceStatus,
    ExternalSourceType,
    type ExternalSource,
    type ExternalSourceRef,
} from '@lightdash/common';
import { getExternalSourceTypeLabel } from '../../externalSources/utils/sourceTypeLabel';

export type ExternalSourceState = {
    label: string;
    color: 'green' | 'blue' | 'red';
    /** Why the last import failed, when it did. */
    message: string | null;
};

export type ExternalSourceRow = {
    source: ExternalSource;
    /** The table's label, as it shows in the Explorer. */
    label: string;
    type: string;
    rows: string;
    state: ExternalSourceState;
};

export const getExternalSourceState = (
    source: ExternalSource,
): ExternalSourceState => {
    switch (source.status) {
        case ExternalSourceStatus.READY:
            return { label: 'Ready', color: 'green', message: null };
        case ExternalSourceStatus.SYNCING:
        case ExternalSourceStatus.STAGED:
            return { label: 'Syncing', color: 'blue', message: null };
        case ExternalSourceStatus.ERROR:
            return {
                label: 'Error',
                color: 'red',
                message: source.errorMessage,
            };
        default:
            return assertUnreachable(
                source.status,
                'Unknown external source status',
            );
    }
};

/** What the dialogs act on: the source's one table. */
export const getExternalSourceRef = (
    source: ExternalSource,
): ExternalSourceRef | null =>
    source.tables[0]
        ? {
              sourceUuid: source.sourceUuid,
              tableUuid: source.tables[0].tableUuid,
              sourceType: source.type,
          }
        : null;

export const getExternalSourceLabel = (source: ExternalSource): string =>
    source.tables[0]?.label ?? source.name;

export const isGoogleSheet = (source: ExternalSource) =>
    source.type === ExternalSourceType.GOOGLE_SHEETS;

export const toExternalSourceRow = (
    source: ExternalSource,
): ExternalSourceRow => {
    const table = source.tables[0];
    return {
        source,
        label: getExternalSourceLabel(source),
        type: getExternalSourceTypeLabel(source.type),
        rows:
            table?.rowCount !== null && table?.rowCount !== undefined
                ? table.rowCount.toLocaleString()
                : '—',
        state: getExternalSourceState(source),
    };
};

export const toExternalSourceRows = (
    sources: ExternalSource[],
): ExternalSourceRow[] =>
    sources
        .map(toExternalSourceRow)
        .sort((a, b) => a.label.localeCompare(b.label));
