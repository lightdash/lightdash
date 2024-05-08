import { isCustomBinDimension, isDimension } from '@lightdash/common';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { CustomBinDimensionModal } from './CustomBinDimensionModel';
import { CustomSqlDimensionModal } from './CustomSqlDimensionModel';

export const CustomDimensionModal = () => {
    const { isOpen, isEditing, table, item } = useExplorerContext(
        (context) => context.state.modals.customDimension,
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
};
