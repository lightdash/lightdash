import { isCustomBinDimension, isDimension } from '@lightdash/common';
import { memo } from 'react';
import { useExplorerSelector } from '../../../features/explorer/store';
import { CustomBinDimensionModal } from './CustomBinDimensionModal';
import { CustomSqlDimensionModal } from './CustomSqlDimensionModal';

export const CustomDimensionModal = memo(() => {
    const { isOpen, isEditing, table, item } = useExplorerSelector(
        (state) => state.explorer.modals.customDimension,
    );

    if (!isOpen) {
        return null;
    }

    if (isDimension(item) || isCustomBinDimension(item)) {
        return <CustomBinDimensionModal isEditing={!!isEditing} item={item} />;
    }

    if (!isEditing && table) {
        return (
            <CustomSqlDimensionModal
                isEditing={!!isEditing}
                table={table}
                item={item}
            />
        );
    }

    if (isEditing && item) {
        return (
            <CustomSqlDimensionModal
                isEditing={isEditing}
                table={item.table}
                item={item}
            />
        );
    }

    return null;
});
