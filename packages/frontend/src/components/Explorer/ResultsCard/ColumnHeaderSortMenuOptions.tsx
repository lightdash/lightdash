import {
    getItemId,
    type CustomDimension,
    type Field,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import {
    explorerActions,
    selectSorts,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    SortDirection,
    getSortDirectionOrder,
    getSortLabel,
} from '../../../utils/sortUtils';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    item: Field | TableCalculation | CustomDimension;
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

    const dispatch = useExplorerDispatch();
    const sorts = useExplorerSelector(selectSorts);

    const setSortFields = useCallback(
        (newSorts: SortField[]) => {
            dispatch(explorerActions.setSortFields(newSorts));
        },
        [dispatch],
    );

    const removeSortField = useCallback(
        (fieldId: string) => {
            const newSorts = sorts.filter((s) => s.fieldId !== fieldId);
            dispatch(explorerActions.setSortFields(newSorts));
        },
        [dispatch, sorts],
    );

    return (
        <>
            <Menu.Label>Sorting</Menu.Label>
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
                                : setSortFields([
                                      {
                                          fieldId: itemFieldId,
                                          descending:
                                              sortDirection ===
                                              SortDirection.DESC,
                                          nullsFirst: true, // TODO: implement UI
                                      },
                                  ])
                        }
                    >
                        Sort{' '}
                        <Text span fw={500}>
                            {getSortLabel(item, sortDirection)}
                        </Text>
                    </Menu.Item>
                ))}
        </>
    );
};

export default ColumnHeaderSortMenuOptions;
