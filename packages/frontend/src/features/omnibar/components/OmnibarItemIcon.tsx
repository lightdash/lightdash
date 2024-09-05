import {
    assertUnreachable,
    SearchItemType,
    type SavedChartSearchResult,
} from '@lightdash/common';
import { Anchor } from '@mantine/core';
import {
    Icon123,
    IconAbc,
    IconAlertTriangleFilled,
    IconBrowser,
    IconFolder,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import {
    getChartIcon,
    IconBox,
    ResourceIndicator,
} from '../../../components/common/ResourceIcon';
import { type SearchItem } from '../types/searchItem';
import { getSearchItemErrorLabel } from '../utils/getSearchItemLabel';

type Props = {
    item: SearchItem;
};

export const getOmnibarItemColor = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return 'gray.7';
        case SearchItemType.DASHBOARD:
            return 'green.8';
        case SearchItemType.CHART:
            return 'blue.8';
        case SearchItemType.SPACE:
            return 'violet.8';
        case SearchItemType.TABLE:
            return 'cyan.8';
        case SearchItemType.PAGE:
            return 'gray.7';
        case SearchItemType.SQL_CHART:
            return 'blue.7';
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};

const getOmnibarItemIcon = (item: SearchItem) => {
    switch (item.type) {
        case SearchItemType.FIELD:
            if (item.typeLabel?.toLowerCase() === 'dimension') {
                return IconAbc;
            } else {
                return Icon123;
            }
        case SearchItemType.DASHBOARD:
            return IconLayoutDashboard;
        case SearchItemType.CHART:
            return getChartIcon(
                // FIXME: typing is loose here
                (item.item as SavedChartSearchResult)?.chartType,
            );
        case SearchItemType.SPACE:
            return IconFolder;
        case SearchItemType.TABLE:
            return IconTable;
        case SearchItemType.PAGE:
            return IconBrowser;
        case SearchItemType.SQL_CHART:
            return getChartIcon(
                // FIXME: typing is loose here
                (item.item as SavedChartSearchResult)?.chartType,
            );
        default:
            return assertUnreachable(
                item.type,
                `Unknown search item type: ${item.type}`,
            );
    }
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
                            onClick={(e) => e.stopPropagation()}
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
