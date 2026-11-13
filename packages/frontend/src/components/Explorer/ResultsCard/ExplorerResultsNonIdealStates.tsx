import {
    isPreviewWarehouseSignInExpiredMessage,
    type ApiErrorDetail,
    type QueryHistoryStatus,
} from '@lightdash/common';
import { Anchor, Button, Text } from '@mantine/core';
import { IconArrowNarrowLeft, IconTableOff } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import { Link } from 'react-router';
import useIsEmbedded from '../../../ee/providers/Embed/useIsEmbedded';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { LD_FIELD_COLORS } from '../../../theme';
import { SectionName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { RefreshButton } from '../../RefreshButton';
import ExploreIdleIllustration from './ExploreIdleIllustration';
import classes from './ExplorerResultsNonIdealStates.module.css';
import { getQueryLoadingStateCopy } from './queryLoadingState';

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

export const EmptyStateNoColumns = () => {
    return (
        <EmptyState
            gap="xs"
            py="xl"
            icon={<ExploreIdleIllustration variant="fields" />}
            titleProps={{ fz: 'sm' }}
            descriptionProps={{ fz: 'xs' }}
            title={
                <>
                    Pick a metric & select its dimensions{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                    />
                </>
            }
            description={
                <>
                    What's your data question? Select the{' '}
                    <Text span c={LD_FIELD_COLORS.metric.color}>
                        metric
                    </Text>{' '}
                    you want to calculate and the{' '}
                    <Text span c={LD_FIELD_COLORS.dimension.color}>
                        dimension(s)
                    </Text>{' '}
                    you want to split it by.
                </>
            }
        >
            <Text className={classes.animatedTextRoot} c="dimmed" fz="xs">
                <Text span>
                    eg. How many{' '}
                    <Text span c={LD_FIELD_COLORS.metric.color}>
                        total signups
                    </Text>{' '}
                    per{' '}
                    <Text span c={LD_FIELD_COLORS.dimension.color}>
                        day
                    </Text>
                    ?
                </Text>

                <Text span>
                    eg. What is the{' '}
                    <Text span c={LD_FIELD_COLORS.metric.color}>
                        total order count
                    </Text>{' '}
                    by{' '}
                    <Text span c={LD_FIELD_COLORS.dimension.color}>
                        location
                    </Text>
                    ?
                </Text>

                <Text span>
                    eg. How many{' '}
                    <Text span c={LD_FIELD_COLORS.metric.color}>
                        new followers
                    </Text>{' '}
                    every{' '}
                    <Text span c={LD_FIELD_COLORS.dimension.color}>
                        week
                    </Text>
                    ?
                </Text>

                <Text span>
                    eg. What is the{' '}
                    <Text span c={LD_FIELD_COLORS.metric.color}>
                        total order count
                    </Text>{' '}
                    split by{' '}
                    <Text span c={LD_FIELD_COLORS.dimension.color}>
                        status
                    </Text>
                    ?
                </Text>
            </Text>
        </EmptyState>
    );
};

export const EmptyStateNoTableData: FC<{ description: React.ReactNode }> = ({
    description,
}) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <EmptyState
            maw={500}
            gap="xs"
            py="xl"
            icon={<ExploreIdleIllustration variant="table" />}
            descriptionProps={{ fz: 'xs' }}
            description={
                <>
                    {description}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                    />
                </>
            }
        >
            <RefreshButton size={'xs'} />
        </EmptyState>
    </TrackSection>
);

export const NoTableSelected = () => (
    <EmptyState
        maw={520}
        gap="xs"
        icon={<ExploreIdleIllustration variant="tables" />}
        title="Pick a table to start"
        titleProps={{ fz: 'sm' }}
        descriptionProps={{ fz: 'xs' }}
        description={
            <>
                Choose a table from the list on the left to see its dimensions
                and metrics.{' '}
                <DocumentationHelpButton
                    href={ExploreDocumentationUrl}
                    pos="relative"
                    top={2}
                />
            </>
        }
    >
        <Button
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconArrowNarrowLeft} />}
            onClick={() =>
                document
                    .querySelector<HTMLInputElement>(
                        '[data-tour-anchor="explore-search"]',
                    )
                    ?.focus()
            }
        >
            Search tables
        </Button>
    </EmptyState>
);

export const EmptyStateExploreLoading = () => (
    <EmptyStateLoader title="Loading tables..." />
);

export const ExploreIdleState = () => (
    <EmptyState
        gap="xs"
        icon={<ExploreIdleIllustration variant="chart" />}
        title="No results yet"
        titleProps={{ fz: 'sm' }}
        description="Run the query to see them here."
        descriptionProps={{ fz: 'xs' }}
    />
);

export const ExploreEmptyQueryState = () => (
    <EmptyState
        title="Query returned no results"
        description="This query ran successfully but returned no results"
    />
);

export const ExploreLoadingState = ({
    queryStatus,
}: {
    queryStatus?: QueryHistoryStatus;
}) => {
    const { title, description } = getQueryLoadingStateCopy(queryStatus);

    return (
        <EmptyState
            gap="xs"
            py="xl"
            icon={<ExploreIdleIllustration variant="chart" loading />}
            title={title}
            titleProps={{ fz: 'sm' }}
            description={description}
            descriptionProps={{ fz: 'xs' }}
            role="status"
            data-testid="results-table-loading"
        />
    );
};

const PreviewSignInExpiredLink: FC = () => {
    const { data: project } = useProject(useProjectUuid());
    const upstreamProjectUuid = project?.upstreamProjectUuid;
    if (!upstreamProjectUuid) return null;
    return (
        <Fragment>
            <br />
            <Anchor
                component={Link}
                to={`/generalSettings/projectManagement/${upstreamProjectUuid}/settings`}
            >
                Open the connection settings
            </Anchor>
        </Fragment>
    );
};

export const ExploreErrorState = ({
    errorDetail,
}: {
    errorDetail?: ApiErrorDetail | null;
}) => {
    const isEmbedded = useIsEmbedded();

    return (
        <EmptyState
            icon={<MantineIcon icon={IconTableOff} />}
            title="Error loading results"
            description={
                <Fragment>
                    <Text className={classes.errorMessage}>
                        {errorDetail?.message ||
                            'There was an error loading the results'}
                    </Text>
                    {errorDetail?.message &&
                        isPreviewWarehouseSignInExpiredMessage(
                            errorDetail.message,
                        ) &&
                        !isEmbedded && <PreviewSignInExpiredLink />}
                    {errorDetail?.data.documentationUrl && !isEmbedded && (
                        <Fragment>
                            <br />
                            <Anchor
                                href={errorDetail.data.documentationUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Learn how to resolve this in our documentation
                            </Anchor>
                        </Fragment>
                    )}
                </Fragment>
            }
        />
    );
};

export const MissingRequiredParameters = ({
    missingRequiredParameters,
}: {
    missingRequiredParameters: string[];
}) => (
    <EmptyState
        title="Missing required parameters"
        description={
            <>
                This query requires additional parameters to run.{' '}
                <Text>
                    {`Please provide the following ${
                        missingRequiredParameters.length === 1
                            ? 'parameter:'
                            : 'parameters:'
                    }`}
                </Text>
                <br />
                <Text span fw={500} size="sm">
                    {missingRequiredParameters.join(', ')}
                </Text>
            </>
        }
    />
);
