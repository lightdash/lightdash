import { ProjectType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildAgentFilterGroups,
    sortAndFilterVisibleProjects,
    type FilterProject,
} from './projectFilterOrdering';

const project = (
    name: string,
    type: ProjectType = ProjectType.DEFAULT,
): FilterProject => ({
    projectUuid: `uuid-${name}`,
    name,
    type,
});

const agent = (name: string, projectName: string) => ({
    uuid: `agent-${name}`,
    name,
    projectUuid: `uuid-${projectName}`,
});

const preview = (name: string) => project(name, ProjectType.PREVIEW);

describe('sortAndFilterVisibleProjects', () => {
    it('sorts production projects first, previews last, alphabetically within tiers', () => {
        const result = sortAndFilterVisibleProjects({
            projects: [
                preview('Zeta preview'),
                project('beta'),
                preview('Alpha preview'),
                project('Alpha'),
            ],
            hidePreviewProjects: false,
            selectedProjectUuids: [],
        });

        expect(result.map((p) => p.name)).toEqual([
            'Alpha',
            'beta',
            'Alpha preview',
            'Zeta preview',
        ]);
    });

    it('hides preview projects when hidePreviewProjects is on', () => {
        const result = sortAndFilterVisibleProjects({
            projects: [preview('Preview'), project('Prod')],
            hidePreviewProjects: true,
            selectedProjectUuids: [],
        });

        expect(result.map((p) => p.name)).toEqual(['Prod']);
    });

    it('keeps selected preview projects visible while hiding is on', () => {
        const result = sortAndFilterVisibleProjects({
            projects: [
                preview('Selected preview'),
                preview('Other preview'),
                project('Prod'),
            ],
            hidePreviewProjects: true,
            selectedProjectUuids: ['uuid-Selected preview'],
        });

        expect(result.map((p) => p.name)).toEqual(['Prod', 'Selected preview']);
    });
});

describe('buildAgentFilterGroups', () => {
    const projects = [
        preview('Preview A'),
        project('Prod B'),
        project('Prod A'),
    ];
    const agents = [
        agent('zed', 'Prod A'),
        agent('amy', 'Prod A'),
        agent('bot', 'Prod B'),
        agent('pre', 'Preview A'),
    ];

    const build = (
        overrides: Partial<Parameters<typeof buildAgentFilterGroups>[0]> = {},
    ) =>
        buildAgentFilterGroups({
            agents,
            projects,
            hidePreviewProjects: false,
            selectedProjectUuids: [],
            selectedAgentUuids: [],
            ...overrides,
        });

    it('orders groups production-first alphabetically and agents alphabetically', () => {
        const result = build();

        expect(result.map((g) => g.projectName)).toEqual([
            'Prod A',
            'Prod B',
            'Preview A',
        ]);
        expect(result[0].agents.map((a) => a.name)).toEqual(['amy', 'zed']);
    });

    it('hides preview project groups when hidePreviewProjects is on', () => {
        const result = build({ hidePreviewProjects: true });

        expect(result.map((g) => g.projectName)).toEqual(['Prod A', 'Prod B']);
    });

    it('keeps a hidden preview group when one of its agents is selected', () => {
        const result = build({
            hidePreviewProjects: true,
            selectedAgentUuids: ['agent-pre'],
        });

        expect(result.map((g) => g.projectName)).toEqual([
            'Prod A',
            'Prod B',
            'Preview A',
        ]);
    });

    it('removes groups from non-selected projects entirely when a project filter is applied', () => {
        const result = build({ selectedProjectUuids: ['uuid-Prod B'] });

        expect(result.map((g) => g.projectName)).toEqual(['Prod B']);
    });

    it('keeps a selected preview project group even while hiding is on', () => {
        const result = build({
            hidePreviewProjects: true,
            selectedProjectUuids: ['uuid-Preview A'],
        });

        expect(result.map((g) => g.projectName)).toEqual(['Preview A']);
    });

    it('skips agents whose project is unknown', () => {
        const result = build({
            agents: [...agents, agent('ghost', 'Deleted project')],
        });

        expect(
            result.flatMap((g) => g.agents.map((a) => a.name)),
        ).not.toContain('ghost');
    });
});
