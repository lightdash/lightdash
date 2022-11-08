import { Colors, NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import styled from 'styled-components';
import { TrackSection } from '../../../providers/TrackingProvider';
import { ReactComponent as NoTableIcon } from '../../../svgs/emptystate-no-table.svg';
import { SectionName } from '../../../types/Events';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { RefreshButton } from '../../RefreshButton';

const Questions = styled('p')`
    color: ${Colors.GRAY1};
    position: relative;
    height: 18px;

    & > span {
        animation: topToBottom 16s linear infinite 0s;
        opacity: 0;
        overflow: hidden;
        position: absolute;
        width: 100%;
        left: 0;
    }

    & span:nth-child(2) {
        animation-delay: 4s;
    }

    & span:nth-child(3) {
        animation-delay: 8s;
    }

    & span:nth-child(4) {
        animation-delay: 12s;
    }

    @keyframes topToBottom {
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
    }
`;

const ExploreNonIdealState = styled(NonIdealState)`
    padding: 50px 0;
    flex: 1;

    & > * {
        max-width: 456px;
    }
`;

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

export const EmptyStateNoColumns = () => (
    <ExploreNonIdealState
        title={
            <>
                Pick a metric & select its dimensions{' '}
                <DocumentationHelpButton
                    url={ExploreDocumentationUrl}
                    iconProps={{
                        iconSize: 18,
                        style: { height: 21, width: 18, paddingTop: 1 },
                    }}
                />
            </>
        }
        description={
            <>
                <p style={{ color: Colors.GRAY3, marginBottom: 18 }}>
                    What’s your data question? Select the{' '}
                    <span style={{ color: Colors.ORANGE1 }}>metric</span> you
                    want to calculate and the{' '}
                    <span style={{ color: Colors.BLUE1 }}>dimension(s)</span>{' '}
                    you want to split it by.
                </p>
                <Questions>
                    <span>
                        eg. How many{' '}
                        <span style={{ color: Colors.ORANGE1 }}>
                            total signups
                        </span>{' '}
                        per <span style={{ color: Colors.BLUE1 }}>day</span> ?
                    </span>
                    <span>
                        eg. What is the{' '}
                        <span style={{ color: Colors.ORANGE1 }}>
                            total order count
                        </span>{' '}
                        by <span style={{ color: Colors.BLUE1 }}>location</span>{' '}
                        ?
                    </span>
                    <span>
                        eg. How many{' '}
                        <span style={{ color: Colors.ORANGE1 }}>
                            new followers
                        </span>{' '}
                        every <span style={{ color: Colors.BLUE1 }}>week</span>{' '}
                        ?
                    </span>
                    <span>
                        eg. What is the{' '}
                        <span style={{ color: Colors.ORANGE1 }}>
                            total order count
                        </span>{' '}
                        split by{' '}
                        <span style={{ color: Colors.BLUE1 }}>status</span> ?
                    </span>
                    <span>
                        eg. How many{' '}
                        <span style={{ color: Colors.ORANGE1 }}>
                            total signups
                        </span>{' '}
                        per <span style={{ color: Colors.BLUE1 }}>day</span> ?
                    </span>
                </Questions>
            </>
        }
    />
);

export const EmptyStateNoTableData: FC<{ description: React.ReactNode }> = ({
    description,
}) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <ExploreNonIdealState
            description={
                <p style={{ color: Colors.GRAY3, marginTop: 40 }}>
                    {description}
                    {'  '}
                    <DocumentationHelpButton url={ExploreDocumentationUrl} />
                </p>
            }
            action={<RefreshButton />}
        />
    </TrackSection>
);

export const NoTableSelected = () => (
    <ExploreNonIdealState
        icon={<NoTableIcon />}
        title="Select a table"
        description={
            <p style={{ color: Colors.GRAY3 }}>
                To run a query, first select the table that you would like to
                explore.{' '}
                <DocumentationHelpButton url={ExploreDocumentationUrl} />
            </p>
        }
    />
);

export const EmptyStateExploreLoading = () => (
    <ExploreNonIdealState title="Loading tables" icon={<Spinner />} />
);
