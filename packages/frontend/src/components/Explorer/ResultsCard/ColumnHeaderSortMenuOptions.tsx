import {
    Field,
    getItemId,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { FC } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import {
    getSortDirectionOrder,
    getSortLabel,
    SortDirection,
} from '../../../utils/sortUtils';
import MantineIcon from '../../common/MantineIcon';
import { BolderLabel } from './ColumnHeaderContextMenu.styles';

type Props = {
    item: Field | TableCalculation;
    sort: SortField | undefined;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({ item, sort }) => {
    const itemFieldId = getItemId(item);
    const hasSort = !!sort;
    const selectedSortDirection = sort
        ? sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC
        : undefined;

    const addSortField = useExplorerContext(
        (context) => context.actions.addSortField,
    );
    const removeSortField = useExplorerContext(
        (context) => context.actions.removeSortField,
    );

    return (
        <>
            {item &&
                getSortDirectionOrder(item).map((sortDirection) => (
                    <Menu.Item
                        key={sortDirection}
                        icon={
                            hasSort &&
                            selectedSortDirection === sortDirection ? (
                                <MantineIcon icon={IconCheck} />
                            ) : undefined
                        }
                        disabled={
                            hasSort && selectedSortDirection === sortDirection
                        }
                        onClick={() =>
                            hasSort && selectedSortDirection === sortDirection
                                ? removeSortField(itemFieldId)
                                : addSortField(itemFieldId, {
                                      descending:
                                          sortDirection === SortDirection.DESC,
                                  })
                        }
                    >
                        Sort{' '}
                        <BolderLabel>
                            {getSortLabel(item, sortDirection)}
                        </BolderLabel>
                    </Menu.Item>
                ))}
        </>
    );
};

export default ColumnHeaderSortMenuOptions;
