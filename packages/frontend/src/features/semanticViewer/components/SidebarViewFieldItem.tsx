import {
    assertUnreachable,
    FieldType as FieldKind,
    type SemanticLayerField,
} from '@lightdash/common';
import { Highlight, NavLink } from '@mantine/core';
import { type FC } from 'react';
import FieldIcon from './FieldIcon';

type SidebarViewFieldItemProps = {
    field: SemanticLayerField;
    searchQuery: string;
    isActive: boolean;
    onFieldToggle: () => void;
};

const getNavbarColorByFieldKind = (kind: SemanticLayerField['kind']) => {
    switch (kind) {
        case FieldKind.DIMENSION:
            return 'blue';
        case FieldKind.METRIC:
            return 'orange';
        default:
            return assertUnreachable(kind, `Unknown field kind ${kind}`);
    }
};

const SidebarViewFieldItem: FC<SidebarViewFieldItemProps> = ({
    field,
    onFieldToggle,
    isActive,
    searchQuery,
}) => {
    return (
        <NavLink
            h={28}
            color={getNavbarColorByFieldKind(field.kind)}
            sx={(theme) => ({
                backgroundColor: theme.fn.lighten(theme.colors.gray[0], 0.5),
            })}
            label={
                <Highlight fz="xs" highlight={searchQuery.split(' ')} truncate>
                    {field.label}
                </Highlight>
            }
            icon={<FieldIcon field={field} size="md" />}
            disabled={!field.visible}
            active={isActive}
            onClick={onFieldToggle}
        />
    );
};

export default SidebarViewFieldItem;
