import { type SemanticLayerField } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch } from '../../store/hooks';
import { addFilterAndOpenModal } from '../../store/semanticViewerSlice';

type Props = {
    field: SemanticLayerField;
};

const FieldFilterItems: FC<Props> = ({ field }) => {
    const dispatch = useAppDispatch();

    const handleAddFilter = useCallback(() => {
        dispatch(
            addFilterAndOpenModal({
                uuid: uuidv4(),
                field: field.name,
                fieldKind: field.kind,
                fieldType: field.type,
                operator: field.availableOperators[0],
                values: [],
            }),
        );
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
