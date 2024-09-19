import { type SemanticLayerField } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { addFilterAndOpenModal } from '../../store/semanticViewerSlice';
import { createFilterForOperator } from '../FiltersModal/createFilterForOperator';

type Props = {
    field: SemanticLayerField;
};

const FieldFilterItems: FC<Props> = ({ field }) => {
    const dispatch = useAppDispatch();

    const handleAddFilter = useCallback(() => {
        const newFilter = createFilterForOperator({
            fieldRef: field.name,
            fieldKind: field.kind,
            fieldType: field.type,
            operator: field.availableOperators[0],
        });

        dispatch(addFilterAndOpenModal(newFilter));
    }, [dispatch, field]);

    if (field.availableOperators.length === 0) return null;

    return (
        <>
            <Menu.Label>Filters</Menu.Label>
            <Menu.Item
                icon={<IconFilter size={14} />}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleAddFilter();
                }}
            >
                Add filter
            </Menu.Item>
        </>
    );
};

export default FieldFilterItems;
