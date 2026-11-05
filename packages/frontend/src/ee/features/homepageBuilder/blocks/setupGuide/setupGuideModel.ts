import {
    assertUnreachable,
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type AgentOnboardingRun,
    type HomepageRecommendedActionKey,
    type OrganizationBrand,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import { AI_NAME } from '../../../../../components/common/aiName';
import {
    getAgentOnboardingRunUrl,
    plural,
} from '../../../agentOnboarding/utils';
import { type ActionStatus } from '../useRecommendedActions';

export type SetupGuideStatus =
    | 'done'
    | 'ready'
    | 'building'
    | 'suggested'
    | 'skipped';

export type SetupGuideRowId =
    | 'warehouse'
    | 'app-data'
    | 'semantic-layer'
    | 'first-chart'
    | 'source-control'
    | 'brand'
    | 'slack'
    | 'invite-team';

export type SetupGuideEvidence = {
    text: string;
    logo: ReactNode | null;
    swatches: string[];
};

export type SetupGuidePreview = { kind: 'agent-run'; run: AgentOnboardingRun };

export type SetupGuideChoice = {
    kind: 'ask' | 'explore';
    label: string;
    to: string;
};

export type SetupGuideRow = {
    id: SetupGuideRowId;
    title: string;
    status: SetupGuideStatus;
    evidence: SetupGuideEvidence | null;
    action: { label: string; to: string } | null;
    /** The checklist key backing this row: drives server-persisted skips and tracking */
    actionKey: HomepageRecommendedActionKey | null;
    preview: SetupGuidePreview | null;
    // Alternative ways to finish the step, offered side by side
    choices: SetupGuideChoice[];
};

export type SetupGuideSection = {
    id:
        | 'data'
        | 'semantic-layer'
        | 'first-chart'
        | 'brand'
        | 'team'
        | 'more-data';
    title: string;
    why: string;
    rows: SetupGuideRow[];
};

/** Everything the guide knows; new detectors (event counts, table counts) add fields here */
export type SetupGuideFacts = {
    projectUuid: string;
    statuses: Record<HomepageRecommendedActionKey, ActionStatus>;
    visibleActions: HomepageRecommendedActionKey[];
    skippedActions: HomepageRecommendedActionKey[];
    // Steps without a server-side skip, skipped in this browser
    skippedRows: SetupGuideRowId[];
    semanticModelCount: number;
    chartCount: number;
    activeRun: AgentOnboardingRun | null;
    // Its run page shows what was built, so review lands there
    completedRun: AgentOnboardingRun | null;
    appSourceNames: string[];
    // The live sources settings page only exists behind its flag and permission
    canAddLiveSources: boolean;
    brand: OrganizationBrand | null;
    teammateCount: number;
};

export const isCompletedStatus = (status: SetupGuideStatus): boolean => {
    switch (status) {
        case 'done':
        case 'ready':
            return true;
        case 'building':
        case 'suggested':
        case 'skipped':
            return false;
        default:
            return assertUnreachable(status, `Unknown status ${status}`);
    }
};

export const isSkippableRow = (row: SetupGuideRow): boolean =>
    row.actionKey === null ||
    (
        SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS as readonly HomepageRecommendedActionKey[]
    ).includes(row.actionKey);

const openStatus = (
    { skippedRows }: SetupGuideFacts,
    id: SetupGuideRowId,
): SetupGuideStatus => (skippedRows.includes(id) ? 'skipped' : 'suggested');

export const countProgress = (rows: SetupGuideRow[]) => ({
    completed: rows.filter((row) => isCompletedStatus(row.status)).length,
    // Skipped rows leave the total, so skipping is a choice rather than a debt
    total: rows.filter((row) => row.status !== 'skipped').length,
});

const evidence = (
    text: string,
    extra: Partial<Omit<SetupGuideEvidence, 'text'>> = {},
): SetupGuideEvidence => ({
    text,
    logo: extra.logo ?? null,
    swatches: extra.swatches ?? [],
});

const checklistRow = (
    facts: SetupGuideFacts,
    actionKey: HomepageRecommendedActionKey,
    id: SetupGuideRowId,
    title: string,
): SetupGuideRow => {
    const status = facts.statuses[actionKey];
    const isSkipped = facts.skippedActions.includes(actionKey);
    return {
        id,
        title,
        status: status.isComplete
            ? 'done'
            : isSkipped
              ? 'skipped'
              : 'suggested',
        evidence:
            status.isComplete && status.annotation
                ? evidence(status.annotation, { logo: status.doneIcon })
                : null,
        action: status.isComplete
            ? { label: 'Manage', to: status.url }
            : { label: status.ctaLabel, to: status.url },
        actionKey,
        preview: null,
        choices: [],
    };
};

const warehouseRow = (facts: SetupGuideFacts): SetupGuideRow => {
    const row = checklistRow(
        facts,
        'connect-warehouse',
        'warehouse',
        'Connect your warehouse',
    );
    return row.evidence
        ? {
              ...row,
              evidence: {
                  ...row.evidence,
                  text: `${row.evidence.text} connected`,
              },
          }
        : row;
};

const appDataRow = (facts: SetupGuideFacts): SetupGuideRow => {
    const { projectUuid, appSourceNames } = facts;
    const to = `/generalSettings/projectManagement/${projectUuid}/liveDataSources`;
    const hasSources = appSourceNames.length > 0;
    return {
        id: 'app-data',
        title: 'Add more data sources',
        status: hasSources ? 'done' : openStatus(facts, 'app-data'),
        evidence: hasSources
            ? evidence(`${appSourceNames.join(', ')} connected`)
            : null,
        action: { label: hasSources ? 'Manage' : 'Connect', to },
        actionKey: null,
        preview: null,
        choices: [],
    };
};

// Explores, not the dbt connection type, say whether a semantic layer exists
const semanticLayerRow = ({
    projectUuid,
    statuses,
    skippedActions,
    activeRun,
    completedRun,
    semanticModelCount,
}: SetupGuideFacts): SetupGuideRow => {
    const { url, ctaLabel } = statuses['add-semantic-layer'];
    const common = {
        id: 'semantic-layer',
        title: 'Define metrics and dimensions',
        actionKey: 'add-semantic-layer',
    } as const;
    if (activeRun) {
        return {
            ...common,
            status: 'building',
            evidence: evidence('Drafting models from your tables'),
            action: { label: 'Open', to: url },
            preview: { kind: 'agent-run', run: activeRun },
            choices: [],
        };
    }
    if (semanticModelCount > 0) {
        return {
            ...common,
            status: 'done',
            evidence: evidence(
                completedRun
                    ? `${plural(semanticModelCount, 'model')} built by ${AI_NAME}`
                    : `${plural(semanticModelCount, 'model')} ready to explore`,
            ),
            action: {
                label: 'Review',
                to: completedRun
                    ? getAgentOnboardingRunUrl(
                          completedRun.agentOnboardingRunUuid,
                          completedRun.projectUuid,
                      )
                    : `/projects/${projectUuid}/tables`,
            },
            preview: null,
            choices: [],
        };
    }
    return {
        ...common,
        status: skippedActions.includes('add-semantic-layer')
            ? 'skipped'
            : 'suggested',
        evidence: null,
        action: { label: ctaLabel, to: url },
        preview: null,
        choices: [],
    };
};

const firstChartRow = (facts: SetupGuideFacts): SetupGuideRow => {
    const { projectUuid, chartCount } = facts;
    return {
        id: 'first-chart',
        title: 'Build your first chart',
        status: chartCount > 0 ? 'done' : openStatus(facts, 'first-chart'),
        evidence: chartCount > 0 ? evidence(plural(chartCount, 'chart')) : null,
        action: {
            label: chartCount > 0 ? 'Browse' : 'Build',
            to:
                chartCount > 0
                    ? `/projects/${projectUuid}/spaces`
                    : `/projects/${projectUuid}/ai-agents`,
        },
        actionKey: null,
        preview: null,
        choices:
            chartCount > 0
                ? []
                : [
                      {
                          kind: 'ask',
                          label: `Ask ${AI_NAME}`,
                          to: `/projects/${projectUuid}/ai-agents`,
                      },
                      {
                          kind: 'explore',
                          label: 'Build in Explore',
                          to: `/projects/${projectUuid}/tables`,
                      },
                  ],
    };
};

const MAX_SWATCHES = 4;

const brandRow = (facts: SetupGuideFacts): SetupGuideRow => {
    const { brand } = facts;
    return {
        id: 'brand',
        title: 'Apply your brand',
        status: brand ? 'done' : openStatus(facts, 'brand'),
        evidence: brand
            ? evidence(brand.name ?? brand.domain, {
                  swatches: brand.colors
                      .slice(0, MAX_SWATCHES)
                      .map(({ hex }) => hex),
              })
            : null,
        action: {
            label: brand ? 'Manage' : 'Set up',
            to: '/generalSettings/appearance',
        },
        actionKey: null,
        preview: null,
        choices: [],
    };
};

const inviteTeamRow = (facts: SetupGuideFacts): SetupGuideRow => {
    const { teammateCount } = facts;
    return {
        id: 'invite-team',
        title: 'Invite your team',
        status: teammateCount > 0 ? 'done' : openStatus(facts, 'invite-team'),
        evidence:
            teammateCount > 0
                ? evidence(plural(teammateCount, 'teammate'))
                : null,
        action:
            teammateCount > 0
                ? { label: 'Manage', to: '/generalSettings/userManagement' }
                : {
                      label: 'Invite',
                      to: '/generalSettings/userManagement?to=invite',
                  },
        actionKey: null,
        preview: null,
        choices: [],
    };
};

export const buildSetupGuide = (
    facts: SetupGuideFacts,
): SetupGuideSection[] => {
    const isVisible = (key: HomepageRecommendedActionKey) =>
        facts.visibleActions.includes(key);
    const answersFromSourcesOnly =
        !facts.statuses['connect-warehouse'].isComplete &&
        facts.appSourceNames.length > 0;
    const sections: SetupGuideSection[] = [
        {
            id: 'data',
            title: 'Your data',
            why: answersFromSourcesOnly
                ? `${AI_NAME} already answers from ${facts.appSourceNames.join(', ')}. Connect a warehouse to add your own tables.`
                : `${AI_NAME} answers by querying your warehouse.`,
            rows: [warehouseRow(facts)],
        },
        {
            id: 'semantic-layer',
            title: 'Your semantic layer',
            why: 'Define revenue once and reuse it in charts and answers.',
            rows: [semanticLayerRow(facts)],
        },
        {
            id: 'first-chart',
            title: 'Your first chart',
            why: `Ask ${AI_NAME}, or pick a table and build it yourself.`,
            rows: [firstChartRow(facts)],
        },
        {
            id: 'brand',
            title: 'Your brand',
            why: 'Your colors and logo on every chart and dashboard.',
            rows: [brandRow(facts)],
        },
        {
            id: 'team',
            title: 'Your team',
            why: 'Teammates can answer their own questions, here or in Slack.',
            rows: [
                inviteTeamRow(facts),
                ...(isVisible('connect-source-control')
                    ? [
                          checklistRow(
                              facts,
                              'connect-source-control',
                              'source-control',
                              'Connect your Git repository',
                          ),
                      ]
                    : []),
                ...(isVisible('connect-slack')
                    ? [
                          checklistRow(
                              facts,
                              'connect-slack',
                              'slack',
                              'Connect Slack',
                          ),
                      ]
                    : []),
            ],
        },
        ...(facts.canAddLiveSources
            ? [
                  {
                      id: 'more-data' as const,
                      title: 'More data',
                      why: `${AI_NAME} can combine live sources with your metrics.`,
                      rows: [appDataRow(facts)],
                  },
              ]
            : []),
    ];
    return sections;
};
