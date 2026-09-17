import { type DataAppVizField } from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import styles from './DataAppVizFieldGuidance.module.css';

const getDataAppVizFieldDescription = (
    field: DataAppVizField,
): string | undefined => field.description?.trim() || undefined;

type Props = {
    field: DataAppVizField;
    id?: string;
};

const DataAppVizFieldGuidance: FC<Props> = ({ field, id }) => {
    const description = getDataAppVizFieldDescription(field);
    if (!description) return null;
    return (
        <Text id={id} hidden>
            {description}
        </Text>
    );
};

export const DataAppVizFieldHelp: FC<{ field: DataAppVizField }> = ({
    field,
}) => {
    const description = getDataAppVizFieldDescription(field);
    if (!description) return null;
    return (
        <Tooltip
            label={description}
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
};

export default DataAppVizFieldGuidance;
