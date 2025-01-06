import { Anchor } from '@mantine/core';
import { IconAlertTriangleFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import {
    IconBox,
    ResourceIndicator,
} from '../../../components/common/ResourceIcon';
import { type SearchItem } from '../types/searchItem';
import { getSearchItemErrorLabel } from '../utils/getSearchItemLabel';
import { getOmnibarItemColor, getOmnibarItemIcon } from './utils';

type Props = {
    item: SearchItem;
};

export const OmnibarItemIcon: FC<Props> = ({ item }) => {
    return (
        <IconBox
            color={getOmnibarItemColor(item.type)}
            icon={getOmnibarItemIcon(item)}
        />
    );
};

type OmnibarItemIconWithIndicatorProps = {
    item: SearchItem;
    projectUuid: string;
    canUserManageValidation: boolean;
};

export const OmnibarItemIconWithIndicator: FC<
    OmnibarItemIconWithIndicatorProps
> = ({ item, projectUuid, canUserManageValidation }) =>
    item.item && 'validationErrors' in item.item ? (
        <ResourceIndicator
            iconProps={{
                color: 'red',
                icon: IconAlertTriangleFilled,
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
                                search: `?validationId=${item.item.validationErrors[0].validationId}`,
                            }}
                            color="blue.4"
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
            <OmnibarItemIcon item={item} />
        </ResourceIndicator>
    ) : null;
