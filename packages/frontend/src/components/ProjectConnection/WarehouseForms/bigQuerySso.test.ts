import { BigqueryAuthenticationType } from '@lightdash/common';
import {
    getBigqueryDefaultAuthenticationType,
    largestDatasetName,
} from './bigQuerySso';

describe('getBigqueryDefaultAuthenticationType', () => {
    it('defaults to SSO when the instance has google oauth configured', () => {
        expect(getBigqueryDefaultAuthenticationType(true)).toBe(
            BigqueryAuthenticationType.SSO,
        );
    });

    it('defaults to a service account key when google oauth is missing', () => {
        expect(getBigqueryDefaultAuthenticationType(false)).toBe(
            BigqueryAuthenticationType.PRIVATE_KEY,
        );
    });
});

describe('largestDatasetName', () => {
    it('returns the largest dataset with a positive known size', () => {
        expect(
            largestDatasetName([
                {
                    projectId: 'project',
                    datasetId: 'unknown',
                    location: 'EU',
                    sizeBytes: null,
                },
                {
                    projectId: 'project',
                    datasetId: 'largest',
                    location: 'EU',
                    sizeBytes: 200,
                },
                {
                    projectId: 'project',
                    datasetId: 'smaller',
                    location: 'EU',
                    sizeBytes: 100,
                },
            ]),
        ).toBe('largest');
    });

    it('returns null when no positive size is known', () => {
        expect(
            largestDatasetName([
                {
                    projectId: 'project',
                    datasetId: 'unknown',
                    location: 'EU',
                    sizeBytes: null,
                },
                {
                    projectId: 'project',
                    datasetId: 'empty',
                    location: 'EU',
                    sizeBytes: 0,
                },
            ]),
        ).toBeNull();
    });
});
