import { Code, List, Text } from '@mantine/core';
import { IconRefreshDot } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefreshPreAggregateByDefinitionName } from '../../../hooks/usePreAggregateRefresh';
import MantineModal from '../MantineModal';

type DashboardPreAggRefreshModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    preAggregateNames: string[];
};

const DashboardPreAggRefreshModal: FC<DashboardPreAggRefreshModalProps> = ({
    opened,
    onClose,
    projectUuid,
    preAggregateNames,
}) => {
    const { t } = useTranslation('modals');
    const { mutateAsync: refreshByName, isLoading } =
        useRefreshPreAggregateByDefinitionName(projectUuid);

    const handleConfirm = async () => {
        await Promise.all(preAggregateNames.map((name) => refreshByName(name)));
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('dashboard.preAggRefresh.title')}
            icon={IconRefreshDot}
            size="lg"
            onConfirm={handleConfirm}
            confirmLabel={t('dashboard.preAggRefresh.confirm')}
            confirmLoading={isLoading}
        >
            <Text fz="sm">
                {t('dashboard.preAggRefresh.body', {
                    count: preAggregateNames.length,
                })}
            </Text>
            <List fz="sm" spacing={4}>
                {preAggregateNames.map((name) => (
                    <List.Item key={name}>
                        <Code>{name}</Code>
                    </List.Item>
                ))}
            </List>
        </MantineModal>
    );
};

export default DashboardPreAggRefreshModal;
