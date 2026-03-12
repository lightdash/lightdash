import { type ApiErrorDetail } from '@lightdash/common';
import { Anchor, Text } from '@mantine-8/core';
import { IconTableOff } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import { LD_FIELD_COLORS } from '../../../mantineTheme';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import NoTableIcon from '../../../svgs/emptystate-no-table.svg?react';
import { SectionName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { RefreshButton } from '../../RefreshButton';
import classes from './ExplorerResultsNonIdealStates.module.css';

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

export const EmptyStateNoColumns = () => {
    return (
        <EmptyState
            title={
                <>
                    Pick a metric & select its dimensions{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                        iconProps={{ size: 'lg' }}
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
            <Text className={classes.animatedTextRoot} c="dimmed">
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
        icon={<NoTableIcon />}
        title="Select a table"
        description={
            <>
                To run a query, first select the table that you would like to
                explore.{' '}
                <DocumentationHelpButton
                    href={ExploreDocumentationUrl}
                    pos="relative"
                    top={2}
                />
            </>
        }
    />
);

export const EmptyStateExploreLoading = () => (
    <EmptyStateLoader title="Loading tables..." />
);

export const ExploreIdleState = () => (
    <EmptyState title="Run query to see your results" />
);

export const ExploreEmptyQueryState = () => (
    <EmptyState
        title="Query returned no results"
        description="This query ran successfully but returned no results"
    />
);

export const ExploreLoadingState = () => (
    <EmptyStateLoader
        title="Loading results"
        data-testid="results-table-loading"
    />
);

export const ExploreErrorState = ({
    errorDetail,
}: {
    errorDetail?: ApiErrorDetail | null;
}) => (
    <EmptyState
        icon={<MantineIcon icon={IconTableOff} />}
        title="Error loading results"
        description={
            <Fragment>
                <Text style={{ whiteSpace: 'pre-wrap' }}>
                    {errorDetail?.message ||
                        'There was an error loading the results'}
                </Text>
                {errorDetail?.data.documentationUrl && (
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
