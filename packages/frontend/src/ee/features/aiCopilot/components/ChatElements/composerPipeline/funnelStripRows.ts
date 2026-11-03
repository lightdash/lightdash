import { type ResultRow } from '@lightdash/common';

export type FunnelResultRow = {
    stepOrder: number;
    stepName: string;
    totalUsers: number;
    breakdownValue: string | null;
};

/** A funnel node's result rows, by their fixed column names. */
export const funnelStripRowsOf = (rows: ResultRow[]): FunnelResultRow[] =>
    rows.map((row) => ({
        stepOrder: Number(row.step_order?.value.raw),
        stepName: String(row.step_name?.value.raw ?? ''),
        totalUsers: Number(row.total_users?.value.raw),
        breakdownValue:
            row.breakdown_value === undefined ||
            row.breakdown_value.value.raw === null
                ? null
                : String(row.breakdown_value.value.raw),
    }));
