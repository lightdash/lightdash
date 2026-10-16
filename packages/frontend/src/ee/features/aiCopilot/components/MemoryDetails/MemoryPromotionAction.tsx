import type { AiAgentMemory, AiAgentMemoryStatus } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC, type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { usePromoteAiAgentMemory } from '../../hooks/useAiAgentMemory';
import {
    useAiAgentOrgPermission,
    useAiAgentPermission,
} from '../../hooks/useAiAgentPermission';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';

const MEMORY_PROMOTION_FORM_ID = 'memory-promotion-form';

type Props = {
    projectUuid: string;
    memoryUuid: string;
    slug: string;
    status: AiAgentMemoryStatus;
    promotionReviewItem: AiAgentMemory['promotionReviewItem'];
};

export const MemoryPromotionAction: FC<Props> = ({
    projectUuid,
    memoryUuid,
    slug,
    status,
    promotionReviewItem,
}) => {
    const { t } = useTranslation('aiAgent');
    const [opened, setOpened] = useState(false);
    const [reason, setReason] = useState('');
    const { data: settings, isLoading: isLoadingSettings } =
        useAiOrganizationSettings();
    const promoteMemory = usePromoteAiAgentMemory();
    const canManageProjectAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const canManageOrganizationAgent = useAiAgentOrgPermission({
        action: 'manage',
    });

    const shouldLinkReviewItem =
        promotionReviewItem &&
        (promotionReviewItem.blocksNewNomination || status === 'promoted');
    if (shouldLinkReviewItem) {
        if (!canManageProjectAgent && !canManageOrganizationAgent) {
            return (
                <Badge color="violet" size="lg">
                    {status === 'promoted'
                        ? t('memoryPromotion.promoted')
                        : t('memoryPromotion.pending')}
                </Badge>
            );
        }
        const params = new URLSearchParams({
            reviewProjectUuid: projectUuid,
            reviewItemUuid: promotionReviewItem.uuid,
        });
        return (
            <Button
                component={Link}
                to={`/generalSettings/ai/issues?${params.toString()}`}
                variant="light"
                color="violet"
                size="xs"
                rightSection={<MantineIcon icon={IconArrowRight} size={14} />}
            >
                {t('memoryPromotion.viewProposal')}
            </Button>
        );
    }

    const reviewsEnabled = settings?.aiAgentReviewsAvailable === true;
    const disabledReason =
        status !== 'active'
            ? t('memoryPromotion.onlyActive')
            : !isLoadingSettings && !reviewsEnabled
              ? t('memoryPromotion.enableReviews')
              : null;
    const nominationReason = reason.trim();

    const resetAndClose = () => {
        setOpened(false);
        setReason('');
    };
    const close = () => {
        if (promoteMemory.isLoading) return;
        resetAndClose();
    };
    const submit = (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        promoteMemory.mutate(
            {
                projectUuid,
                memoryUuid,
                slug,
                ...(nominationReason ? { reason: nominationReason } : {}),
            },
            { onSuccess: resetAndClose },
        );
    };

    return (
        <>
            <Tooltip label={disabledReason} disabled={!disabledReason}>
                <Box component="span">
                    <Button
                        variant="default"
                        size="xs"
                        disabled={isLoadingSettings || !!disabledReason}
                        onClick={() => setOpened(true)}
                    >
                        {t('memoryPromotion.propose')}
                    </Button>
                </Box>
            </Tooltip>

            <MantineModal
                opened={opened}
                onClose={close}
                title={t('memoryPromotion.modalTitle')}
                size="md"
                cancelDisabled={promoteMemory.isLoading}
                actions={
                    <Button
                        type="submit"
                        form={MEMORY_PROMOTION_FORM_ID}
                        loading={promoteMemory.isLoading}
                    >
                        {t('memoryPromotion.create')}
                    </Button>
                }
            >
                <form id={MEMORY_PROMOTION_FORM_ID} onSubmit={submit}>
                    <Stack gap="sm">
                        <Text fz="sm" c="dimmed">
                            {t('memoryPromotion.explanation')}
                        </Text>
                        <Textarea
                            label={t('memoryPromotion.reasonLabel')}
                            description={t('memoryPromotion.reasonDescription')}
                            value={reason}
                            onChange={(event) =>
                                setReason(event.currentTarget.value)
                            }
                            minRows={3}
                            autosize
                            autoFocus
                        />
                    </Stack>
                </form>
            </MantineModal>
        </>
    );
};
