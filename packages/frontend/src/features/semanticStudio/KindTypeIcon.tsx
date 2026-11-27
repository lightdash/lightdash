import {
    DimensionType,
    FieldType,
    MetricType,
    type Field as LightdashField,
} from '@lightdash/common';
import { IconArrowsJoin } from '@tabler/icons-react';
import { type FC } from 'react';
import { TableIcon } from '../../components/common/ContentIcons';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { type FieldKind } from './model';
import { type FieldChange } from './modelCode';

const isDimensionType = (type: string): type is DimensionType =>
    Object.values<string>(DimensionType).includes(type);
const isMetricType = (type: string): type is MetricType =>
    Object.values<string>(MetricType).includes(type);

/** The explorer's field icon, from a field kind and type. */
export const KindTypeIcon: FC<{
    fieldKind: FieldKind;
    type: string;
    name: string;
    size?: 'md' | 'lg';
}> = ({ fieldKind, type, name, size = 'md' }) => (
    <FieldIcon
        size={size}
        item={
            {
                fieldType:
                    fieldKind === 'metric'
                        ? FieldType.METRIC
                        : FieldType.DIMENSION,
                type:
                    fieldKind === 'metric'
                        ? isMetricType(type)
                            ? type
                            : MetricType.NUMBER
                        : isDimensionType(type)
                          ? type
                          : DimensionType.STRING,
                name,
                label: name,
            } as LightdashField
        }
    />
);

/** The icon of a part a change touched: the explorer's own for a field, a quiet one for a join or the model. */
export const FieldChangeIcon: FC<{
    field: Pick<FieldChange, 'kind' | 'name' | 'type'>;
}> = ({ field }) =>
    field.kind === 'dimension' || field.kind === 'metric' ? (
        <KindTypeIcon
            fieldKind={field.kind}
            type={field.type ?? ''}
            name={field.name}
        />
    ) : (
        <MantineIcon
            icon={field.kind === 'join' ? IconArrowsJoin : TableIcon}
            color="dimmed"
        />
    );
