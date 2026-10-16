import { type AiAgentReviewItemPrDiff } from '@lightdash/common';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../../../components/common/MantineModal';
import { ReviewPrDiffContent } from './ReviewPrDiffContent';

type Props = {
    opened: boolean;
    onClose: () => void;
    diff: AiAgentReviewItemPrDiff | undefined;
    isLoading: boolean;
};

export const ReviewPrDiffModal: FC<Props> = ({
    opened,
    onClose,
    diff,
    isLoading,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('reviews.prDiff.title')}
            icon={IconGitPullRequest}
            size="80vw"
        >
            <ReviewPrDiffContent diff={diff} isLoading={isLoading} />
        </MantineModal>
    );
};
