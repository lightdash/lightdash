import type {
    AgentSkillsListing,
    AiAgentSkillSummary,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toSkillMentionItems } from './skillMentions';

const summary = (
    overrides: Partial<AiAgentSkillSummary> & { name: string },
): AiAgentSkillSummary => ({
    uuid: `uuid-${overrides.name}`,
    organizationUuid: 'org',
    projectUuid: null,
    title: null,
    description: `About ${overrides.name}`,
    argumentHint: null,
    disableModelInvocation: false,
    userInvocable: true,
    availability: ['agent', 'mcp'],
    currentVersion: {
        uuid: 'v',
        versionNumber: 1,
        contentHash: 'sha256:0',
        source: 'ui',
        restoredFromVersion: null,
        createdAt: new Date(0),
        createdByUserUuid: null,
    },
    agentUuids: [],
    createdByUserUuid: null,
    updatedByUserUuid: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    ...overrides,
});

const listing: AgentSkillsListing = {
    skills: [
        summary({ name: 'weekly-review', argumentHint: '[region]' }),
        summary({ name: 'model-only', userInvocable: false }),
        summary({ name: 'mcp-only', availability: ['mcp'] }),
    ],
    builtInSkills: [{ name: 'table-calculations', description: 'Formulas.' }],
};

describe('toSkillMentionItems', () => {
    it('lists only user-invocable agent skills and never built-ins', () => {
        expect(toSkillMentionItems(listing).map((item) => item.label)).toEqual([
            '/weekly-review',
        ]);
    });

    it('carries the argument hint', () => {
        expect(toSkillMentionItems(listing)[0]).toMatchObject({
            argumentHint: '[region]',
        });
    });

    it('is empty without a listing', () => {
        expect(toSkillMentionItems(undefined)).toEqual([]);
    });
});
