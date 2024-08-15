import { Loader, Text } from '@mantine/core';
import { createStyles, keyframes } from '@mantine/emotion';
import { type FC } from 'react';
import { TrackSection } from '../../../providers/TrackingProvider';
import NoTableIcon from '../../../svgs/emptystate-no-table.svg?react';
import { SectionName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { RefreshButton } from '../../RefreshButton';

const animationKeyframes = keyframes`
    0% {
        opacity: 0;
    }
    5% {
        opacity: 0;
        transform: translateY(-10px);
    }
    10% {
        opacity: 1;
        transform: translateY(0px);
    }
    25% {
        opacity: 1;
        transform: translateY(0px);
    }
    30% {
        opacity: 0;
        transform: translateY(10px);
    }
    80% {
        opacity: 0;
    }
    100% {
        opacity: 0;
    }
`;

const useAnimatedTextStyles = createStyles((theme) => ({
    root: {
        position: 'relative',
        height: theme.spacing.lg,
        textAlign: 'center',
        width: '100%',

        '& > span': {
            animation: `${animationKeyframes} 16s linear infinite 0s`,
            opacity: 0,
            overflow: 'hidden',
            position: 'absolute',
            width: '100%',
            left: 0,
        },

        '& span:nth-of-type(2)': {
            animationDelay: '4s',
        },

        '& span:nth-of-type(3)': {
            animationDelay: '8s',
        },

        '& span:nth-of-type(4)': {
            animationDelay: '12s',
        },
    },
}));

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

export const EmptyStateNoColumns = () => {
    const { classes } = useAnimatedTextStyles();

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
                    What’s your data question? Select the{' '}
                    <Text span color="yellow.9">
                        metric
                    </Text>{' '}
                    you want to calculate and the{' '}
                    <Text span color="blue.9">
                        dimension(s)
                    </Text>{' '}
                    you want to split it by.
                </>
            }
        >
            <Text className={classes.root} color="dimmed">
                <Text span>
                    eg. How many{' '}
                    <Text span color="yellow.9">
                        total signups
                    </Text>{' '}
                    per{' '}
                    <Text span color="blue.9">
                        day
                    </Text>
                    ?
                </Text>

                <Text span>
                    eg. What is the{' '}
                    <Text span color="yellow.9">
                        total order count
                    </Text>{' '}
                    by{' '}
                    <Text span color="blue.9">
                        location
                    </Text>
                    ?
                </Text>

                <Text span>
                    eg. How many{' '}
                    <Text span color="yellow.9">
                        new followers
                    </Text>{' '}
                    every{' '}
                    <Text span color="blue.9">
                        week
                    </Text>
                    ?
                </Text>

                <Text span>
                    eg. What is the{' '}
                    <Text span color="yellow.9">
                        total order count
                    </Text>{' '}
                    split by{' '}
                    <Text span color="blue.9">
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
        maw={500}
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
    <EmptyState title="Loading tables...">
        <Loader color="gray" />
    </EmptyState>
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
    <EmptyState title="Loading results">
        <Loader color="gray" />
    </EmptyState>
);
