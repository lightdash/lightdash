import { Group, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../MantineIcon';

/** A footer cell for a column whose total cannot be computed exactly. */
const TotalNotComputableCell: FC<{ reason: string }> = ({ reason }) => {
    const { t } = useTranslation('table');
    return (
        <Tooltip maw={360} multiline label={reason}>
            <Group
                component="span"
                gap={4}
                justify="flex-end"
                wrap="nowrap"
                c="dimmed"
                w="100%"
                style={{ cursor: 'help' }}
                aria-label={t('totals.noTotalWithReason', { reason })}
            >
                <MantineIcon icon={IconInfoCircle} size={14} />
                <Text component="span" size="xs" c="inherit">
                    {t('totals.noTotal')}
                </Text>
            </Group>
        </Tooltip>
    );
};

export default TotalNotComputableCell;
