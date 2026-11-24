import type { ReadyQueryResultsPage } from '@lightdash/common';

export type ReadyResultsPageEnvelope = Omit<ReadyQueryResultsPage, 'rows'>;

const bodyPrefix = Buffer.from('{"status":"ok","results":{"rows":');

export const composeResultsPageBody = (
    rows: Buffer,
    envelope: ReadyResultsPageEnvelope,
): Buffer => {
    const rest = JSON.stringify(envelope);
    const tail = rest === '{}' ? '}}' : `,${rest.slice(1)}}`;
    return Buffer.concat([bodyPrefix, rows, Buffer.from(tail)]);
};
