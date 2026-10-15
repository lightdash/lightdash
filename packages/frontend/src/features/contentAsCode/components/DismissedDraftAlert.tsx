import { Alert, Button, Group, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

type DismissedDraftAlertProps = {
    isReopening: boolean;
    onReopen: () => void;
};

const DismissedDraftAlert: FC<DismissedDraftAlertProps> = ({
    isReopening,
    onReopen,
}) => {
    const { t } = useTranslation('contentAsCode');
    return (
        <Alert
            color="blue"
            icon={<MantineIcon icon={IconRestore} />}
            title={t('dismissedDraft.title')}
            mx="md"
            mt="md"
        >
            <Group justify="space-between" wrap="nowrap">
                <Text size="sm">{t('dismissedDraft.description')}</Text>
                <Button
                    size="xs"
                    variant="light"
                    loading={isReopening}
                    onClick={onReopen}
                >
                    {t('dismissedDraft.reopen')}
                </Button>
            </Group>
        </Alert>
    );
};

export default DismissedDraftAlert;
