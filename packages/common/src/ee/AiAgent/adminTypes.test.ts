import {
    BEDROCK_REGIONS,
    getBedrockInferenceGeographiesForRegion,
} from './adminTypes';

describe('BEDROCK_REGIONS', () => {
    it('offers Frankfurt and Ireland so inference can stay in the EU', () => {
        expect(BEDROCK_REGIONS).toContain('eu-central-1');
        expect(BEDROCK_REGIONS).toContain('eu-west-1');
    });

    // Every region we offer must default to a geography that pins residency;
    // only the admin's explicit choice may widen it to global.
    it('defaults each offered region to a residency-pinned geography', () => {
        BEDROCK_REGIONS.forEach((region) => {
            const [narrowest] = getBedrockInferenceGeographiesForRegion(region);
            expect(narrowest).not.toBe('global');
        });
    });
});
