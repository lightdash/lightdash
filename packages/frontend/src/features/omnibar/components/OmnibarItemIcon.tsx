import { Anchor } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import {
    ContentIcon,
    ResourceIndicator,
} from '../../../components/common/ResourceIcon';
import { type SearchItem } from '../types/searchItem';
import { getSearchItemErrorLabel } from '../utils/getSearchItemLabel';
import { getOmnibarItemColor, getOmnibarItemIcon } from './utils';

type Props = {
    item: SearchItem;
    size: 'md' | 'lg';
};

export const OmnibarItemIcon: FC<Props> = ({ item, size }) => {
    return (
        <ContentIcon
            color={getOmnibarItemColor(item.type)}
            icon={getOmnibarItemIcon(item)}
            size={size}
        />
    );
};

type OmnibarItemIconWithIndicatorProps = Props & {
    projectUuid: string;
    canUserManageValidation: boolean;
};

export const OmnibarItemIconWithIndicator: FC<
    OmnibarItemIconWithIndicatorProps
> = ({ item, size, projectUuid, canUserManageValidation }) =>
    item.item && 'validationErrors' in item.item ? (
        <ResourceIndicator
            iconProps={{
                color: 'red',
                icon: IconAlertTriangle,
            }}
            tooltipProps={{
                maw: 300,
                withinPortal: true,
                multiline: true,
                offset: -2,
                position: 'bottom',
            }}
            tooltipLabel={
                canUserManageValidation ? (
                    <>
                        This content is broken. Learn more about the validation
                        error(s){' '}
                        <Anchor
                            component={Link}
                            fw={600}
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                                e.stopPropagation()
                            }
                            to={{
                                pathname: `/generalSettings/projectManagement/${projectUuid}/validator`,
                                search: `?validationUuid=${item.item.validationErrors[0].validationUuid}`,
                            }}
                            c="blue.4"
                            fz="xs"
                        >
                            here
                        </Anchor>
                        .
                    </>
                ) : (
                    `There's an error with this ${getSearchItemErrorLabel(
                        item.type,
                    )}`
                )
            }
        >
            <OmnibarItemIcon item={item} size={size} />
        </ResourceIndicator>
    ) : null;
