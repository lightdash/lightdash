import {
    AGENT_CAPABILITY_DEFINITIONS,
    AgentCapability,
} from '@lightdash/common';
import { getRequiredAgentCapabilities } from '../agentPermissions/capabilityMap';
import { HUMAN_ONLY_IN_MANAGED } from '../agentPermissions/humanOnlyInManaged';
import { evaluateGrant } from './evaluateGrant';
import {
    grantFixture,
    malformedProjectConstraints,
    projectGrantFixture,
} from './grant.mock';

const projectUuid = grantFixture().approvedProjectUuids[0];
const otherProjectUuid = '22222222-2222-4222-8222-222222222222';
const evaluate = (
    key: string,
    capabilities: AgentCapability[],
    projects = [projectUuid],
    approvedProjects = [projectUuid],
) =>
    evaluateGrant({
        now: new Date(),
        grant: {
            ...grantFixture(),
            approvedCapabilities: capabilities,
            approvedProjectUuids: approvedProjects,
        },
        kind: 'rest',
        key,
        projectUuids: projects,
    });

it.each([
    'ProjectController.getProject',
    'QueryController.executeAsyncMetricQuery',
    'QueryController.executeAsyncSqlQuery',
    'ProjectCoderController.upsertChartAsCode',
    'SqlRunnerController.deleteSqlChart',
    'ExploreController.SetExplores',
    'ParametersController.replaceParameters',
])('requires mapped capabilities for registered %s', (operation) => {
    const required = getRequiredAgentCapabilities('rest', operation)!;
    expect(evaluate(operation, Object.values(AgentCapability))).toBeNull();
    for (const capability of required)
        expect(
            evaluate(
                operation,
                Object.values(AgentCapability).filter(
                    (value) => value !== capability,
                ),
            ),
        ).toContain(AGENT_CAPABILITY_DEFINITIONS[capability].name);
});
it.each(['allowed', 'other', 'empty'])('checks every project: %s', (choice) => {
    const projectCases: Record<string, string[]> = {
        allowed: [projectUuid],
        other: [projectUuid, otherProjectUuid],
        empty: [],
    };
    const projects = projectCases[choice];
    expect(
        evaluate(
            'ProjectController.getProject',
            [AgentCapability.ReadDiscover],
            projects,
        ) === null,
    ).toBe(choice === 'allowed');
});
it('denies unknown operations', () =>
    expect(evaluate('unknown', Object.values(AgentCapability))).toContain(
        'operation',
    ));
it.each([...HUMAN_ONLY_IN_MANAGED])('denies people-only %s', (key) =>
    expect(evaluate(key, Object.values(AgentCapability))).toContain('person'),
);
it('requires all capabilities of composite operations', () => {
    expect(
        evaluate('ProjectCoderController.upsertSqlChartAsCode', [
            AgentCapability.ContentWrite,
            AgentCapability.DeployUpload,
        ]),
    ).toContain('SQL');
    expect(
        evaluate('ProjectCoderController.upsertSqlChartAsCode', [
            AgentCapability.ContentWrite,
            AgentCapability.RawSql,
            AgentCapability.DeployUpload,
        ]),
    ).toBeNull();
});
it.each([
    'UserController.getAuthenticatedUser',
    'OrganizationController.getOrganization',
])('allows only CLI discovery %s without a project', (key) =>
    expect(evaluate(key, [AgentCapability.ReadDiscover], [])).toBeNull(),
);
it.each([
    'OrganizationController.getProjects',
    'UserController.getPersonalAccessTokens',
    'organizationRouter POST /projects/precompiled',
    'ProjectController.createPreview',
])('denies listing, credentials and creation: %s', (key) =>
    expect(evaluate(key, Object.values(AgentCapability), [])).not.toBeNull(),
);
it('requires deploy capability for content uploads too', () =>
    expect(
        evaluate('ProjectCoderController.upsertChartAsCode', [
            AgentCapability.ContentWrite,
        ]),
    ).toContain('Deploy'));
it('rejects unknown constraint and grant versions', () => {
    for (const grant of [
        { ...grantFixture(), grantContractVersion: 2 },
        { ...grantFixture(), resourceConstraints: { version: 2 } },
    ])
        expect(
            evaluateGrant({
                now: new Date(),
                grant: grant as ReturnType<typeof grantFixture>,
                kind: 'rest',
                key: 'ProjectController.getProject',
                projectUuids: [projectUuid],
            }),
        ).not.toBeNull();
});

it('denies MCP organization project listing even with a pinned approved project', () => {
    expect(
        evaluateGrant({
            now: new Date(),
            grant: grantFixture(),
            kind: 'mcp',
            key: 'list_projects',
            projectUuids: [projectUuid],
        }),
    ).not.toBeNull();
});

it('allows the CLI startup version check without a project', () => {
    expect(
        evaluate('apiV1Router GET /health', [AgentCapability.ReadDiscover], []),
    ).toBeNull();
});

it.each([
    ['QueryController.executeAsyncMetricQuery', 0, true],
    ['ProjectController.refresh', 0, false],
    ['ProjectController.refresh', 1, true],
    ['QueryController.executeAsyncMetricQuery', 1, false],
] as const)('v2 checks %s on project %s', (key, project, allowed) => {
    const grant = projectGrantFixture();
    expect(
        evaluateGrant({
            grant,
            kind: 'rest',
            key,
            projectUuids: [grant.approvedProjectUuids[project]],
            now: new Date(),
        }) === null,
    ).toBe(allowed);
});
it('v2 requires an action on every project in a spanning operation', () => {
    const grant = projectGrantFixture();
    const run = () =>
        evaluateGrant({
            grant,
            kind: 'rest',
            key: 'QueryController.executeAsyncMetricQuery',
            projectUuids: grant.approvedProjectUuids,
            now: new Date(),
        });
    expect(run()).not.toBeNull();
    Object.assign(
        grant,
        projectGrantFixture(
            Object.fromEntries(
                grant.approvedProjectUuids.map((uuid) => [
                    uuid,
                    [AgentCapability.Query],
                ]),
            ),
        ),
    );
    expect(run()).toBeNull();
});
it.each(malformedProjectConstraints)(
    'refuses malformed stored constraints %j',
    (resourceConstraints) => {
        const grant = {
            ...projectGrantFixture({ [projectUuid]: [AgentCapability.Query] }),
            resourceConstraints,
        } as ReturnType<typeof grantFixture>;
        expect(
            evaluateGrant({
                grant,
                kind: 'rest',
                key: 'QueryController.executeAsyncMetricQuery',
                projectUuids: [projectUuid],
                now: new Date(),
            }),
        ).not.toBeNull();
    },
);
