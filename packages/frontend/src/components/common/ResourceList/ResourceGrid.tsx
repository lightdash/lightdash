import { Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { assertUnreachable } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ResourceListCommonProps } from '.';
import { useSpaces } from '../../../hooks/useSpaces';
import { ResourceListActionState } from './ResourceActionHandlers';
import ResourceActionMenu from './ResourceActionMenu';
import ResourceIcon from './ResourceIcon';
import ResourceLastEdited from './ResourceLastEdited';
import {
    Flex,
    ResourceLink,
    ResourceMetadata,
    ResourceName,
    ResourceNameBox,
    ResourceSpaceLink,
    Spacer,
    StyledTable,
    StyledTBody,
    StyledTd,
    StyledTh,
    StyledTHead,
    StyledTr,
    ThInteractiveWrapper,
} from './ResourceTable.styles';
import ResourceType from './ResourceType';
import {
    isResourceListItemCanBelongToSpace,
    ResourceListItem,
    ResourceListType,
} from './ResourceTypeUtils';

type ResourceTableProps = Pick<ResourceListCommonProps, 'items'> & {
    onAction: (newAction: ResourceListActionState) => void;
};

const getResourceUrl = (projectUuid: string, item: ResourceListItem) => {
    const itemType = item.type;
    switch (item.type) {
        case ResourceListType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceListType.CHART:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        case ResourceListType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        default:
            return assertUnreachable(item, `Can't get URL for ${itemType}`);
    }
};

const ResourceTable: FC<ResourceTableProps> = ({ items, onAction }) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);

    return (
        <div>
            {items.map((item) => (
                <>
                    <>{item.data.name}</>
                    <ResourceActionMenu
                        item={item}
                        url={getResourceUrl(projectUuid, item)}
                        onAction={onAction}
                        spaces={spaces}
                    />
                </>
            ))}
        </div>
    );
};

export default ResourceTable;
