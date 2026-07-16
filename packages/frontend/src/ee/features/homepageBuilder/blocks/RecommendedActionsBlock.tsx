import {
    DbtProjectType,
    type HomepageRecommendedActionKey,
} from '@lightdash/common';
import { Button, Checkbox, Stack, Text, TextInput } from '@mantine-8/core';
import {
    IconActivity,
    IconBrandGithub,
    IconBrandSlack,
    IconCheck,
    IconChevronRight,
    IconDatabase,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useGithubConfig } from '../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import classes from './blockStyles.module.css';
import { RECOMMENDED_ACTION_KEYS } from './recommendedActionDefaults';
import styles from './RecommendedActionsBlock.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

type ActionDefinition = {
    icon: Icon;
    title: string;
    subtitle: string;
};

const ACTION_DEFINITIONS: Record<
    HomepageRecommendedActionKey,
    ActionDefinition
> = {
    'connect-warehouse': {
        icon: IconDatabase,
        title: 'Connect a data warehouse',
        subtitle: 'Query your data directly',
    },
    'add-semantic-layer': {
        icon: IconActivity,
        title: 'Add a semantic layer',
        subtitle: 'Answers grounded in your business definitions',
    },
    'connect-github': {
        icon: IconBrandGithub,
        title: 'Connect GitHub',
        subtitle: 'Sync dbt models & version control',
    },
    'connect-slack': {
        icon: IconBrandSlack,
        title: 'Connect Slack',
        subtitle: 'Ask Aurora from your channels',
    },
};

type ActionStatus = {
    isVisible: boolean;
    isComplete: boolean;
    annotation: string | null;
    url: string;
};

const useActionStatuses = (
    projectUuid: string,
): Record<HomepageRecommendedActionKey, ActionStatus> => {
    const { health } = useApp();
    const { data: organization } = useOrganization();
    const { data: project } = useProject(projectUuid);
    const { data: githubConfig } = useGithubConfig();
    const { data: slack, isSuccess: isSlackSuccess } = useGetSlack();

    const dbtConnection = project?.dbtConnection;
    const hasSemanticLayer =
        !!dbtConnection && dbtConnection.type !== DbtProjectType.NONE;
    const isSlackConnected =
        isSlackSuccess && !!slack && slack.hasRequiredScopes !== false;

    return {
        'connect-warehouse': {
            isVisible: true,
            isComplete: organization?.needsProject === false,
            annotation: project?.warehouseConnection?.type ?? null,
            url: '/onboarding/data-source',
        },
        'add-semantic-layer': {
            isVisible: true,
            isComplete: hasSemanticLayer,
            annotation: dbtConnection?.type ?? null,
            url: `/generalSettings/projectManagement/${projectUuid}/settings`,
        },
        'connect-github': {
            isVisible: !!health.data?.hasGithub,
            isComplete: githubConfig?.enabled === true,
            annotation: 'Connected',
            url: '/generalSettings/integrations',
        },
        'connect-slack': {
            isVisible: !!health.data?.hasSlack,
            isComplete: isSlackConnected,
            annotation: slack?.slackTeamName ?? 'Connected',
            url: '/generalSettings/integrations',
        },
    };
};

const ActionRow: FC<{
    actionKey: HomepageRecommendedActionKey;
    status: ActionStatus;
}> = ({ actionKey, status }) => {
    const { track } = useTracking();
    const definition = ACTION_DEFINITIONS[actionKey];
    return (
        <div
            className={
                status.isComplete
                    ? `${styles.actionRow} ${styles.actionRowDone}`
                    : styles.actionRow
            }
        >
            {status.isComplete ? (
                <div className={styles.doneCircle}>
                    <MantineIcon icon={IconCheck} size={16} />
                </div>
            ) : (
                <div className={styles.emptyCircle} />
            )}
            <div
                className={
                    status.isComplete
                        ? `${styles.iconTile} ${styles.iconTileDone}`
                        : styles.iconTile
                }
            >
                <MantineIcon icon={definition.icon} size={22} />
            </div>
            <div className={styles.rowBody}>
                <div
                    className={
                        status.isComplete
                            ? `${styles.rowTitle} ${styles.rowTitleDone}`
                            : styles.rowTitle
                    }
                >
                    {definition.title}
                </div>
                <div className={styles.rowSubtitle}>
                    {status.isComplete
                        ? status.annotation
                        : definition.subtitle}
                </div>
            </div>
            {!status.isComplete && (
                <Button
                    component={Link}
                    to={status.url}
                    variant="subtle"
                    size="compact-sm"
                    rightSection={
                        <MantineIcon icon={IconChevronRight} size={14} />
                    }
                    onClick={() =>
                        track({
                            name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
                            properties: { actionKey },
                        })
                    }
                >
                    Set up
                </Button>
            )}
        </div>
    );
};

const RecommendedActionsList: FC<{
    title: string;
    actions: HomepageRecommendedActionKey[];
    projectUuid: string;
}> = ({ title, actions, projectUuid }) => {
    const statuses = useActionStatuses(projectUuid);
    const visibleActions = actions.filter((key) => statuses[key].isVisible);
    if (visibleActions.length === 0) return null;

    const sortedActions = [...visibleActions].sort(
        (a, b) =>
            Number(statuses[a].isComplete) - Number(statuses[b].isComplete),
    );
    const doneCount = visibleActions.filter(
        (key) => statuses[key].isComplete,
    ).length;

    return (
        <Stack gap={8}>
            <div className={styles.headerRow}>
                <span className={classes.sectionTitle}>{title}</span>
                <Text size="xs" c="dimmed">
                    {doneCount} of {visibleActions.length} done
                </Text>
            </div>
            {sortedActions.map((key) => (
                <ActionRow key={key} actionKey={key} status={statuses[key]} />
            ))}
        </Stack>
    );
};

export const RecommendedActionsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'recommended-actions') return null;
    return (
        <RecommendedActionsList
            title={block.config.title}
            actions={block.config.actions}
            projectUuid={projectUuid}
        />
    );
};

export const RecommendedActionsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    if (block.type !== 'recommended-actions') return null;

    const toggleAction = (key: HomepageRecommendedActionKey) => {
        const actions = block.config.actions.includes(key)
            ? block.config.actions.filter((action) => action !== key)
            : RECOMMENDED_ACTION_KEYS.filter(
                  (action) =>
                      action === key || block.config.actions.includes(action),
              );
        onChange({ ...block, config: { ...block.config, actions } });
    };

    return (
        <Stack gap="xs">
            <TextInput
                aria-label="Recommended actions title"
                size="xs"
                fw={600}
                value={block.config.title}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            title: e.currentTarget.value,
                        },
                    })
                }
            />
            <RecommendedActionsList
                title={block.config.title}
                actions={block.config.actions}
                projectUuid={projectUuid}
            />
            <Stack gap={6}>
                {RECOMMENDED_ACTION_KEYS.map((key) => (
                    <Checkbox
                        key={key}
                        size="xs"
                        label={ACTION_DEFINITIONS[key].title}
                        checked={block.config.actions.includes(key)}
                        onChange={() => toggleAction(key)}
                    />
                ))}
            </Stack>
        </Stack>
    );
};
