import { ContentAsCodeType } from '@lightdash/common'; // pragma: allowlist secret
import { describe, expect, it } from 'vitest';
import { getContentAsCodeTypeLabel } from './contentAsCodeTypeLabel';

describe('getContentAsCodeTypeLabel', () => {
    it('maps known content-as-code types to display labels', () => {
        expect(getContentAsCodeTypeLabel(ContentAsCodeType.CHART)).toBe(
            'Chart',
        );
        expect(getContentAsCodeTypeLabel(ContentAsCodeType.SQL_CHART)).toBe(
            'SQL chart',
        );
        expect(
            getContentAsCodeTypeLabel(ContentAsCodeType.GOOGLE_SHEETS_SYNC),
        ).toBe('Google Sheets sync');
    });

    it('humanizes unknown content types without inventing a label', () => {
        expect(getContentAsCodeTypeLabel('custom_resource')).toBe(
            'custom resource',
        );
    });
});
