import { subject } from '@casl/ability';
import {
    FeatureFlags,
    DbtProjectType,
    DbtProjectTypeLabels,
    ProjectType,
    type HomepageRecommendedActionKey,
} from '@lightdash/common';
import { useEffect, useState, type ReactNode } from 'react';
import { useGithubConfig } from '../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import { useGitlabRepositories } from '../../../../components/common/GitlabIntegration/hooks/useGitlabIntegration';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useProject } from '../../../../hooks/useProject';
import { useProjects } from '../../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../../../utils/playgroundProject';
import {
    RECOMMENDED_ACTION_KEYS,
    readSkippedActions,
} from './recommendedActionDefaults';

export type ActionStatus = {
    isVisible: boolean;
    isComplete: boolean;
    annotation: string | null;
    /** Replaces the default icon once the action is complete */
    doneIcon: ReactNode | null;
    url: string;
};

const useActionStatuses = (
    projectUuid: string | null,
): Record<HomepageRecommendedActionKey, ActionStatus> => {
    const { health } = useApp();
    const { data: organization } = useOrganization();
    const { data: project } = useProject(projectUuid ?? undefined);
    const { data: projects } = useProjects();
    const { data: githubConfig } = useGithubConfig();
    const { data: slack, isSuccess: isSlackSuccess } = useGetSlack();
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const codingAgentOnboardingFlag = useServerFeatureFlag(
        FeatureFlags.CodingAgentOnboarding,
    );
    const hasAgentSemanticLayerEntry =
        newOnboardingFlag.data?.enabled === true &&
        codingAgentOnboardingFlag.data?.enabled === true;

    const hasGithub = !!health.data?.hasGithub;
    const hasGitlab = !!health.data?.hasGitlab;
    const { isSuccess: isGitlabConnected } = useGitlabRepositories({
        enabled: hasGitlab,
    });
    const isGithubConnected = githubConfig?.enabled === true;

    const dbtConnection = project?.dbtConnection;
    const hasSemanticLayer =
        !!dbtConnection && dbtConnection.type !== DbtProjectType.NONE;
    const isSlackConnected =
        isSlackSuccess && !!slack && slack.hasRequiredScopes !== false;

    // A playground is a project, so `needsProject` alone would report the
    // warehouse step as done on sample data
    const hasRealWarehouseProject =
        organization?.needsProject === false &&
        (projects?.some(
            ({ type, provisioningSource }) =>
                type === ProjectType.DEFAULT &&
                !isPlaygroundProvisioningSource(provisioningSource),
        ) ??
            false);
    const warehouseType =
        hasRealWarehouseProject &&
        !isPlaygroundProvisioningSource(project?.provisioningSource)
            ? project?.warehouseConnection?.type
            : undefined;

    return {
        'connect-warehouse': {
            isVisible: true,
            isComplete: hasRealWarehouseProject,
            annotation: warehouseType ? getWarehouseLabel(warehouseType) : null,
            doneIcon: warehouseType
                ? getWarehouseIcon(warehouseType, 'sm')
                : null,
            url: '/onboarding/data-source',
        },
        'add-semantic-layer': {
            isVisible: !!projectUuid,
            isComplete: hasSemanticLayer,
            annotation: dbtConnection
                ? DbtProjectTypeLabels[dbtConnection.type]
                : null,
            doneIcon: null,
            url: hasAgentSemanticLayerEntry
                ? `/projects/${projectUuid}/onboarding/agent`
                : `/generalSettings/projectManagement/${projectUuid}/settings`,
        },
        'connect-source-control': {
            isVisible: hasGithub || hasGitlab,
            isComplete: isGithubConnected || isGitlabConnected,
            annotation: isGithubConnected ? 'GitHub' : 'GitLab',
            doneIcon: null,
            url: '/generalSettings/integrations',
        },
        'connect-slack': {
            isVisible: !!health.data?.hasSlack,
            isComplete: isSlackConnected,
            annotation: slack?.slackTeamName ?? 'Connected',
            doneIcon: null,
            url: '/generalSettings/integrations',
        },
    };
};

export const useRecommendedActions = (projectUuid: string | null) => {
    const { user } = useApp();
    const statuses = useActionStatuses(projectUuid);
    const { data: project } = useProject(projectUuid ?? undefined);
    const isPlaygroundProject = isPlaygroundProvisioningSource(
        project?.provisioningSource,
    );
    const [skippedActions, setSkippedActions] = useState<
        HomepageRecommendedActionKey[]
    >(() => readSkippedActions(projectUuid));

    const canManageProject =
        user.data?.ability?.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid ?? undefined,
            }),
        ) ?? false;

    useEffect(() => {
        setSkippedActions(readSkippedActions(projectUuid));
    }, [projectUuid]);

    // On sample data the only step worth offering is the way out — the rest
    // point at the playground's own settings
    const visibleActions = isPlaygroundProject
        ? (['connect-warehouse'] as HomepageRecommendedActionKey[])
        : RECOMMENDED_ACTION_KEYS.filter((key) => statuses[key].isVisible);
    const hasPendingActions =
        canManageProject &&
        visibleActions.some(
            (key) => !statuses[key].isComplete && !skippedActions.includes(key),
        );

    return {
        statuses,
        skippedActions,
        setSkippedActions,
        visibleActions,
        hasPendingActions,
    };
};

export type RecommendedActionsState = ReturnType<typeof useRecommendedActions>;
