import {
    assertUnreachable,
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type AgentOnboardingRun,
    type HomepageRecommendedActionKey,
    type OrganizationBrand,
} from '@lightdash/common';
import { type ReactNode } from 'react';
import { type ActionStatus } from '../useRecommendedActions';

/** The homepage corner toolbar slot a hidden guide portals its popover button into */
export const SETUP_GUIDE_CORNER_SLOT_ID = 'homepage-setup-guide-slot';

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
    | 'source-control'
    | 'starter-dashboard'
    | 'brand'
    | 'slack'
    | 'invite-team';

export type SetupGuideEvidence = {
    text: string;
    logo: ReactNode | null;
    swatches: string[];
};

export type SetupGuidePreview = { kind: 'agent-run'; run: AgentOnboardingRun };

export type SetupGuideRow = {
    id: SetupGuideRowId;
    title: string;
    status: SetupGuideStatus;
    evidence: SetupGuideEvidence | null;
    action: { label: string; to: string } | null;
    /** The checklist key backing this row: drives server-persisted skips and tracking */
    actionKey: HomepageRecommendedActionKey | null;
    preview: SetupGuidePreview | null;
};

export type SetupGuideSection = {
    id: 'data' | 'semantic-layer' | 'starter-content' | 'team';
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
    semanticModelCount: number;
    activeRun: AgentOnboardingRun | null;
    appSourceNames: string[];
    starterDashboard: { uuid: string; name: string } | null;
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
    row.actionKey !== null &&
    (
        SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS as readonly HomepageRecommendedActionKey[]
    ).includes(row.actionKey);

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

const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

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

const appDataRow = ({
    projectUuid,
    appSourceNames,
}: SetupGuideFacts): SetupGuideRow => {
    const to = `/generalSettings/projectManagement/${projectUuid}/liveDataSources`;
    const hasSources = appSourceNames.length > 0;
    return {
        id: 'app-data',
        title: 'Add more data sources',
        status: hasSources ? 'done' : 'suggested',
        evidence: hasSources
            ? evidence(`${appSourceNames.join(', ')} connected`)
            : null,
        action: { label: hasSources ? 'Manage' : 'Connect', to },
        actionKey: null,
        preview: null,
    };
};

// Explores, not the dbt connection type, say whether a semantic layer exists
const semanticLayerRow = ({
    projectUuid,
    statuses,
    skippedActions,
    activeRun,
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
        };
    }
    if (semanticModelCount > 0) {
        return {
            ...common,
            status: 'done',
            evidence: evidence(
                `${plural(semanticModelCount, 'model')} ready to explore`,
            ),
            action: { label: 'Review', to: `/projects/${projectUuid}/tables` },
            preview: null,
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
    };
};

const starterDashboardRow = ({
    projectUuid,
    activeRun,
    starterDashboard,
}: SetupGuideFacts): SetupGuideRow => {
    const common = {
        id: 'starter-dashboard',
        title: 'Start from a first dashboard',
        actionKey: null,
        preview: null,
    } as const;
    if (starterDashboard) {
        return {
            ...common,
            status: 'ready',
            evidence: evidence(starterDashboard.name),
            action: {
                label: 'Review',
                to: `/projects/${projectUuid}/dashboards/${starterDashboard.uuid}`,
            },
        };
    }
    if (activeRun) {
        return {
            ...common,
            status: 'building',
            evidence: evidence('Drafted once your models are ready'),
            action: null,
        };
    }
    return {
        ...common,
        status: 'suggested',
        evidence: null,
        action: { label: 'Create', to: `/projects/${projectUuid}/dashboards` },
    };
};

const MAX_SWATCHES = 4;

const brandRow = ({ brand }: SetupGuideFacts): SetupGuideRow => ({
    id: 'brand',
    title: 'Apply your brand',
    status: brand ? 'done' : 'suggested',
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
});

const inviteTeamRow = ({ teammateCount }: SetupGuideFacts): SetupGuideRow => ({
    id: 'invite-team',
    title: 'Invite your team',
    status: teammateCount > 0 ? 'done' : 'suggested',
    evidence:
        teammateCount > 0 ? evidence(plural(teammateCount, 'teammate')) : null,
    action:
        teammateCount > 0
            ? { label: 'Manage', to: '/generalSettings/userManagement' }
            : {
                  label: 'Invite',
                  to: '/generalSettings/userManagement?to=invite',
              },
    actionKey: null,
    preview: null,
});

export const buildSetupGuide = (
    facts: SetupGuideFacts,
): SetupGuideSection[] => {
    const isVisible = (key: HomepageRecommendedActionKey) =>
        facts.visibleActions.includes(key);
    const sections: SetupGuideSection[] = [
        {
            id: 'data',
            title: 'Your data',
            why: 'Aurora answers by querying your warehouse.',
            rows: [warehouseRow(facts), appDataRow(facts)],
        },
        {
            id: 'semantic-layer',
            title: 'Your semantic layer',
            why: 'Define revenue once and reuse it in charts and answers.',
            rows: [
                semanticLayerRow(facts),
                ...(isVisible('connect-source-control')
                    ? [
                          checklistRow(
                              facts,
                              'connect-source-control',
                              'source-control',
                              'Already use dbt? Connect it',
                          ),
                      ]
                    : []),
            ],
        },
        {
            id: 'starter-content',
            title: 'Starter content',
            why: 'A first dashboard in your colors gives people somewhere to begin.',
            rows: [starterDashboardRow(facts), brandRow(facts)],
        },
        {
            id: 'team',
            title: 'Your team',
            why: 'Teammates can answer their own questions, here or in Slack.',
            rows: [
                inviteTeamRow(facts),
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
    ];
    return sections;
};
