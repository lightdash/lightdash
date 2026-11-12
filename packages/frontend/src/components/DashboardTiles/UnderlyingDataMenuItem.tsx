import { subject } from '@casl/ability';
import {
    hasCustomBinDimension,
    isOtherPivotReference,
    type MetricQuery,
    type PivotReference,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconStack } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useLocation } from 'react-router';
import { useUiString } from '../../ee/providers/Embed/useUiStrings';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useAccount } from '../../hooks/user/useAccount';
import { Can } from '../../providers/Ability';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

type Props = {
    onViewUnderlyingData: () => void;
    metricQuery: MetricQuery;
    /** The clicked series. "Other" has no rows of its own to show. */
    pivotReference?: PivotReference;
};

const TrackedItem: FC<{ onClick: () => void }> = ({ onClick }) => {
    const label = useUiString('tileMenu.viewUnderlyingData');
    const { track } = useTracking();
    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};
    const projectUuid = useProjectUuid();

    const handleClick = useCallback(() => {
        onClick();

        const identity = account?.isRegisteredUser
            ? { accountId: account?.user?.id }
            : { anonymousId: 'embed', externalId: account?.user?.id };
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                ...identity,
                organizationId: organizationUuid,
                projectId: projectUuid,
            },
        });
    }, [onClick, account, organizationUuid, projectUuid, track]);

    return (
        <Menu.Item
            leftSection={<MantineIcon icon={IconStack} />}
            onClick={handleClick}
        >
            {label}
        </Menu.Item>
    );
};

export const UnderlyingDataMenuItem: FC<Props> = ({
    metricQuery,
    onViewUnderlyingData,
    pivotReference,
}) => {
    const label = useUiString('tileMenu.viewUnderlyingData');
    const { data: account } = useAccount();
    const { organizationUuid } = account?.organization || {};
    const projectUuid = useProjectUuid();
    const { pathname } = useLocation();

    if (
        hasCustomBinDimension(metricQuery) ||
        isOtherPivotReference(pivotReference)
    ) {
        return null;
    }

    const canTrack = !pathname.includes('/minimal');

    return (
        <Can
            I="view"
            this={subject('UnderlyingData', {
                organizationUuid,
                projectUuid: projectUuid,
            })}
        >
            {canTrack ? (
                <TrackedItem onClick={onViewUnderlyingData} />
            ) : (
                <Menu.Item
                    leftSection={<MantineIcon icon={IconStack} />}
                    onClick={onViewUnderlyingData}
                >
                    {label}
                </Menu.Item>
            )}
        </Can>
    );
};
