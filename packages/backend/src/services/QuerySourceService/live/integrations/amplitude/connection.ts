import {
    AMPLITUDE_PATHS,
    AMPLITUDE_REGION_ORIGINS,
    ApiConnectorType,
    getAmplitudeRegion,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveTestSummary,
} from '../../sdk';

// The setup test lists the project's events, with this week's totals
const testResponseSchema = z.object({
    data: z.array(z.object({ value: z.string().optional() }).passthrough()),
});

export const summarizeAmplitudeTest = (
    body: unknown,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: 'Connected to your Amplitude project',
        facts: [
            {
                label: 'Tracked events',
                value: formatTestCount(parsed.data.data.length),
            },
        ],
    };
};

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.AMPLITUDE];

export const amplitudeConnection: LiveConnection<ApiConnectorType.AMPLITUDE> = {
    settings: CATALOG.settings,
    origins: [AMPLITUDE_REGION_ORIGINS.us, AMPLITUDE_REGION_ORIGINS.eu],
    access: () => ({
        rules: Object.values(AMPLITUDE_PATHS).map((path) =>
            readRule('GET', path),
        ),
    }),
    checkAuth: ({ type }) => {
        if (type !== 'api_key') {
            throw new ParameterError(
                'Amplitude connections authenticate with the project API key and secret key',
            );
        }
    },
    describeTarget: ({ origin, targetLabel }) => {
        const region = getAmplitudeRegion(origin).toUpperCase();
        return `Amplitude project${targetLabel ? ` "${targetLabel}"` : ''}, ${region} data region`;
    },
    summarizeTest: summarizeAmplitudeTest,
};
