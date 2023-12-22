import { SavedChartSearchResult } from '@lightdash/common';
import { Anchor } from '@mantine/core';
import {
    Icon123,
    IconAbc,
    IconAlertTriangle,
    IconAppWindow,
    IconFolder,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import {
    ChartIcon,
    IconBox,
    ResourceIndicator,
} from '../../common/ResourceIcon';
import { SearchItem } from './hooks';

type SearchIconProps = {
    searchItem: SearchItem;
};

export const SearchIcon: FC<React.PropsWithChildren<SearchIconProps>> = ({
    searchItem,
}) => {
    switch (searchItem.type) {
        case 'field':
            return (
                <IconBox
                    color="gray.7"
                    icon={
                        searchItem.typeLabel.toLowerCase() === 'dimension'
                            ? IconAbc
                            : Icon123
                    }
                />
            );
        case 'dashboard':
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        case 'saved_chart':
            return (
                <ChartIcon
                    chartType={
                        (searchItem.item as SavedChartSearchResult)?.chartType
                    }
                />
            );
        case 'space':
            return <IconBox icon={IconFolder} color="violet.8" />;
        case 'table':
            return <IconBox icon={IconTable} color="blue.8" />;
        case 'page':
            return <IconBox icon={IconAppWindow} color="gray.7" />;
    }
};

export const SearchIconWithIndicator: FC<
    React.PropsWithChildren<{
        searchResult: SearchItem;
        projectUuid: string;
        canUserManageValidation: boolean;
    }>
> = ({ searchResult, projectUuid, canUserManageValidation }) =>
    searchResult.item && 'validationErrors' in searchResult.item ? (
        <ResourceIndicator
            iconProps={{
                fill: 'red',
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
                            onClick={(e) => e.stopPropagation()}
                            to={{
                                pathname: `/generalSettings/projectManagement/${projectUuid}/validator`,
                                search: `?validationId=${searchResult.item.validationErrors[0].validationId}`,
                            }}
                            color="blue.4"
                        >
                            here
                        </Anchor>
                        .
                    </>
                ) : (
                    <>
                        There's an error with this{' '}
                        {searchResult.type === 'saved_chart' ? 'chart' : null}
                        {searchResult.type === 'dashboard' ? 'dashboard' : null}
                        {searchResult.type === 'table' ? 'table' : null}.
                    </>
                )
            }
        >
            <SearchIcon searchItem={searchResult} />
        </ResourceIndicator>
    ) : null;
