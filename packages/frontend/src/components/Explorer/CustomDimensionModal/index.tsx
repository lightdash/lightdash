import { subject } from '@casl/ability';
import { isCustomBinDimension, isDimension } from '@lightdash/common';
import { memo } from 'react';
import { useExplorerSelector } from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useApp from '../../../providers/App/useApp';
import { CustomBinDimensionModal } from './CustomBinDimensionModal';
import { CustomSqlDimensionModal } from './CustomSqlDimensionModal';

export const CustomDimensionModal = memo(() => {
    const { isOpen, isEditing, table, item } = useExplorerSelector(
        (state) => state.explorer.modals.customDimension,
    );
    const projectUuid = useProjectUuid();
    const { user } = useApp();

    if (!isOpen) {
        return null;
    }

    if (isDimension(item) || isCustomBinDimension(item)) {
        return <CustomBinDimensionModal isEditing={!!isEditing} item={item} />;
    }

    // Gate the SQL custom dimension modal behind manage:CustomFields. Backend
    // already rejects on save; this prevents users without scope from spending
    // time in an editor whose changes can't be persisted.
    const cannotAuthorCustomSql = user.data?.ability.cannot(
        'manage',
        subject('CustomFields', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
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
