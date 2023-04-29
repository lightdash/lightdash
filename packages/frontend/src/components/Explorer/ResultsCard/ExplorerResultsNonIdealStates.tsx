import {
    createStyles,
    DefaultProps,
    keyframes,
    Loader,
    Stack,
    Text,
    TextProps,
    Title,
    TitleProps,
} from '@mantine/core';
import React, { FC } from 'react';

import { TrackSection } from '../../../providers/TrackingProvider';
import { ReactComponent as NoTableIcon } from '../../../svgs/emptystate-no-table.svg';
import { SectionName } from '../../../types/Events';
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

        '& span:nth-child(2)': {
            animationDelay: '4s',
        },

        '& span:nth-child(3)': {
            animationDelay: '8s',
        },

        '& span:nth-child(4)': {
            animationDelay: '12s',
        },
    },
}));

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

type EmptyStateProps = DefaultProps & {
    icon?: React.ReactNode;
    title?: React.ReactNode;
    titleProps?: TitleProps;
    description?: React.ReactNode;
    descriptionProps?: TextProps;
};

const EmptyState: FC<EmptyStateProps> = ({
    icon,
    title,
    titleProps,
    description,
    descriptionProps,
    children,
    maw = 400,
    ...defaultMantineProps
}) => {
    return (
        <Stack align="center" pt="4xl" pb="5xl" {...defaultMantineProps}>
            {icon}

            {title ? (
                <Title
                    align="center"
                    fw={500}
                    order={4}
                    maw={maw}
                    {...titleProps}
                >
                    {title}
                </Title>
            ) : null}

            {description ? (
                <Text
                    span
                    align="center"
                    color="dimmed"
                    maw={maw}
                    {...descriptionProps}
                >
                    {description}
                </Text>
            ) : null}

            {children}
        </Stack>
    );
};

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
            maw={450}
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
            <RefreshButton />
        </EmptyState>
    </TrackSection>
);

export const NoTableSelected = () => (
    <EmptyState
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
