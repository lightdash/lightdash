import {
    WarehouseTypes,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { shouldShowMyAgentConnections } from './visibility';

const rules = (
    snowflake: OrganizationAgentIdentityRule['source'],
    bigquery: OrganizationAgentIdentityRule['source'],
): OrganizationAgentIdentityRule[] => [
    {
        warehouseType: WarehouseTypes.SNOWFLAKE,
        source: snowflake,
        projectsMissingAiServiceAccount: null,
    },
    {
        warehouseType: WarehouseTypes.BIGQUERY,
        source: bigquery,
        projectsMissingAiServiceAccount: null,
    },
];

describe('shouldShowMyAgentConnections', () => {
    it.each([
        [false, 'agent_sign_in', 'ai_service_account', false],
        [true, 'marked_person', 'marked_person', false],
        [true, 'agent_sign_in', 'marked_person', true],
        [true, 'marked_person', 'ai_service_account', true],
    ] as const)(
        'checks flag %s and rules %s / %s',
        (flag, snowflake, bigquery, visible) => {
            expect(
                shouldShowMyAgentConnections(flag, rules(snowflake, bigquery)),
            ).toBe(visible);
        },
    );
    it('hides the page until rules load', () => {
        expect(shouldShowMyAgentConnections(true, [])).toBe(false);
    });
});
