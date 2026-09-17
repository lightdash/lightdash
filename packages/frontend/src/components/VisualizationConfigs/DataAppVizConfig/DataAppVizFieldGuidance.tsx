import { type DataAppVizField } from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import styles from './DataAppVizFieldGuidance.module.css';

const defaultGuidance: Record<DataAppVizField['type'], string> = {
    dimension: 'Choose the category or label that identifies each row.',
    metric: 'Choose the numeric value for each row.',
    series: 'Choose the category that separates the chart into series.',
    column: 'Choose the result column the chart reads for this slot.',
};

const getDescription = (field: DataAppVizField): string =>
    field.description?.trim() || defaultGuidance[field.type];

type Props = {
    field: DataAppVizField;
    id?: string;
};

const DataAppVizFieldGuidance: FC<Props> = ({ field, id }) => (
    <Text id={id} hidden>
        {getDescription(field)}
    </Text>
);

export const DataAppVizFieldHelp: FC<{ field: DataAppVizField }> = ({
    field,
}) => (
    <Tooltip
        label={getDescription(field)}
        position="top"
        events={{ hover: true, focus: true, touch: false }}
        className={styles.helpText}
    >
        <MantineIcon
            icon={IconInfoCircle}
            size={14}
            color="dimmed"
            tabIndex={0}
            role="img"
            aria-hidden={false}
            aria-label={`About ${field.label}`}
            className="mantine-focus-auto"
        />
    </Tooltip>
);

export default DataAppVizFieldGuidance;
