import { MenuItem2 } from '@blueprintjs/popover2';
import {
    Field,
    getItemId,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import { FC } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import {
    getSortDirectionOrder,
    getSortLabel,
    SortDirection,
} from '../../../utils/sortUtils';
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
                    <MenuItem2
                        key={sortDirection}
                        roleStructure="listoption"
                        selected={
                            hasSort && selectedSortDirection === sortDirection
                        }
                        text={
                            <>
                                Sort{' '}
                                <BolderLabel>
                                    {getSortLabel(item, sortDirection)}
                                </BolderLabel>
                            </>
                        }
                        onClick={() =>
                            hasSort && selectedSortDirection === sortDirection
                                ? removeSortField(itemFieldId)
                                : addSortField(itemFieldId, {
                                      descending:
                                          sortDirection === SortDirection.DESC,
                                  })
                        }
                    />
                ))}
        </>
    );
};

export default ColumnHeaderSortMenuOptions;
