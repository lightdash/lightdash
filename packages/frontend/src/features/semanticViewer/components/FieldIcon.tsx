import {
    assertUnreachable,
    FieldType as FieldKind,
    SemanticLayerFieldType,
    type SemanticLayerField,
} from '@lightdash/common';
import {
    Icon123,
    IconAbc,
    IconClockHour4,
    IconToggleLeft,
} from '@tabler/icons-react';
import { forwardRef } from 'react';
import MantineIcon, {
    type MantineIconProps,
} from '../../../components/common/MantineIcon';

const getFieldColor = (kind: SemanticLayerField['kind']) => {
    switch (kind) {
        case FieldKind.DIMENSION:
            return 'blue';
        case FieldKind.METRIC:
            return 'orange';
        default:
            return assertUnreachable(kind, `Unknown field kind: ${kind}`);
    }
};

const getFieldIconName = (type: SemanticLayerFieldType) => {
    switch (type) {
        case SemanticLayerFieldType.STRING:
            return 'citation';
        case SemanticLayerFieldType.NUMBER:
            return 'numerical';
        case SemanticLayerFieldType.TIME:
            return 'time';
        case SemanticLayerFieldType.BOOLEAN:
            return 'segmented-control';
        default:
            // FIXME: type should be FieldType
            // return assertUnreachable(type, `Unknown field type: ${type}`);
            throw new Error(`Unknown field type: ${type}`);
    }
};

type Props = Omit<MantineIconProps, 'icon'> & {
    field: SemanticLayerField;
    selected?: boolean;
};

const FieldIcon = forwardRef<SVGSVGElement, Props>(
    ({ field, size = 'lg', selected, ...iconProps }, ref) => {
        const iconColor = selected
            ? 'white'
            : iconProps.color ?? getFieldColor(field.kind);

        const props = {
            ...iconProps,
            ref,
            size,
            color: iconColor,
        };

        const iconName = getFieldIconName(field.type);

        switch (iconName) {
            case 'citation':
                return <MantineIcon icon={IconAbc} {...props} />;
            case 'numerical':
                return <MantineIcon icon={Icon123} {...props} />;
            case 'time':
                return <MantineIcon icon={IconClockHour4} {...props} />;
            case 'segmented-control':
                return <MantineIcon icon={IconToggleLeft} {...props} />;
            default:
                return assertUnreachable(
                    iconName,
                    `Unknown field type: ${iconName}`,
                );
        }
    },
);

export default FieldIcon;
