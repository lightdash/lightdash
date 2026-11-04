import { type DataAppAnalysisSource } from '@lightdash/common';

export const sourcesSignature = (sources: DataAppAnalysisSource[]): string =>
    sources
        .map((s) => s.queryUuid)
        .sort()
        .join('|');
