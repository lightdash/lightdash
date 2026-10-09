import {
    ProjectType,
    WarehouseTypes,
    type OrganizationProject,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getAgentConnectionVisibility,
    shouldShowMyAgentConnections,
} from './visibility';

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

describe('getAgentConnectionVisibility', () => {
    const project: OrganizationProject = {
        projectUuid: 'project',
        name: 'Project',
        type: ProjectType.DEFAULT,
        createdByUserUuid: null,
        createdByUserName: null,
        createdAt: new Date('2026-10-09'),
        upstreamProjectUuid: null,
        expiresAt: null,
        warehouseType: WarehouseTypes.SNOWFLAKE,
    };

    it('shows required Snowflake sign-in without depending on server configuration', () => {
        expect(
            getAgentConnectionVisibility(
                rules('agent_sign_in', 'marked_person'),
                [project],
            ),
        ).toEqual({ showSnowflake: true, showBigQuery: false });
    });

    it('hides Snowflake when the rule does not require sign-in', () => {
        expect(
            getAgentConnectionVisibility(
                rules('marked_person', 'marked_person'),
                [project],
            ).showSnowflake,
        ).toBe(false);
    });

    it('hides Snowflake without an accessible Snowflake project', () => {
        expect(
            getAgentConnectionVisibility(
                rules('agent_sign_in', 'marked_person'),
                [],
            ).showSnowflake,
        ).toBe(false);
    });
});
