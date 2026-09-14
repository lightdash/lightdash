import { type RelativeDateFilterDescriptor } from '@lightdash/common';

export const MATERIALIZATION_FINGERPRINT_REFERENCE_TIME =
    '2000-06-15T12:00:00.000Z';

export type RelativeDateFilterOwner =
    | { type: 'query'; fieldId: string; position: string }
    | {
          type: 'metric';
          metricId: string;
          position: number;
          occurrence: number;
      };

export type RelativeDateFilterFingerprint = {
    owner: RelativeDateFilterOwner;
    filter: RelativeDateFilterDescriptor;
};

export type MaterializationQueryFingerprint =
    | {
          status: 'reusable';
          comparisonSql: string;
          relativeDateFilters: RelativeDateFilterFingerprint[];
      }
    | { status: 'non-reusable'; reasons: string[] };

export type MaterializationFingerprintCollector = {
    filters: RelativeDateFilterFingerprint[];
    reasons: Set<string>;
};
