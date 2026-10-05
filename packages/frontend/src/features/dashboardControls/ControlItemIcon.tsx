import { VisuallyHidden } from '@mantine/core';
import { IconSql } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { type ControlModel } from './context';

// What stands before a field's name in the open control's lists: the
// field-type icon, or for a SQL chart's column, which has no field behind
// it, the SQL icon today's filter popover gives a column filter
const ControlItemIcon: FC<{ model: ControlModel; id: string }> = ({
    model,
    id,
}) => {
    const field = model.getField(id);
    if (field) return <FieldIcon item={field} size="sm" />;
    if (!model.isSqlColumn(id)) return null;
    return (
        <>
            <MantineIcon icon={IconSql} size="sm" color="dimmed" aria-hidden />
            <VisuallyHidden>SQL column</VisuallyHidden>
        </>
    );
};

export default ControlItemIcon;
