import { Icon, NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import { ResourceListProps } from '.';
import {
    EmptyStateIcon,
    EmptyStateText,
    EmptyStateWrapper,
} from './ResourceEmptyState.styles';

type Props = Pick<
    ResourceListProps,
    'headerAction' | 'resourceType' | 'resourceIcon'
> & {
    onClickCTA?: () => void;
};

const ResourceEmptyState: FC<Props> = ({
    resourceType,
    resourceIcon,
    onClickCTA,
}) => {
    return (
        <EmptyStateWrapper>
            <NonIdealState
                description={
                    <EmptyStateWrapper>
                        <EmptyStateIcon icon={resourceIcon} size={40} />

                        <EmptyStateText>
                            No {resourceType}s added yet
                        </EmptyStateText>

                        <p>
                            Hit <Icon icon="plus" size={14} /> to get started.
                        </p>
                    </EmptyStateWrapper>
                }
            />
        </EmptyStateWrapper>
    );
};

export default ResourceEmptyState;
