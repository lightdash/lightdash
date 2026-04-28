import { isCustomBinDimension, isDimension } from '@lightdash/common';
import { memo } from 'react';
import { useExplorerSelector } from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useCannotAuthorCustomSql } from '../../../hooks/user/useCannotAuthorCustomSql';
import { CustomBinDimensionModal } from './CustomBinDimensionModal';
import { CustomSqlDimensionModal } from './CustomSqlDimensionModal';

export const CustomDimensionModal = memo(() => {
    const { isOpen, isEditing, table, item } = useExplorerSelector(
        (state) => state.explorer.modals.customDimension,
    );
    const projectUuid = useProjectUuid();
    const cannotAuthorCustomSql = useCannotAuthorCustomSql(projectUuid);

    if (!isOpen) {
        return null;
    }

    if (isDimension(item) || isCustomBinDimension(item)) {
        return <CustomBinDimensionModal isEditing={!!isEditing} item={item} />;
    }

    if (cannotAuthorCustomSql) {
        return null;
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
