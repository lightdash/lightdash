import { Anchor, Avatar, Button } from '@mantine/core';
import { IconChevronLeft, IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingWrapper from './common/OnboardingWrapper';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
    const { t } = useTranslation('projectConnection');
    const { track } = useTracking();

    return (
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-50}
                leftSection={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                {t('actions.back', { ns: 'common' })}
            </Button>

            <ProjectCreationCard>
                <EmptyState
                    py="unset"
                    icon={
                        <Avatar size="lg" radius="xl">
                            <MantineIcon
                                icon={IconExclamationCircle}
                                size="xxl"
                                strokeWidth={1.5}
                                color="black"
                            />
                        </Avatar>
                    }
                    title={
                        <>
                            <Trans
                                t={t}
                                i18nKey="connectFlow.unsupported.title"
                                components={{
                                    adaptersLink: (
                                        <Anchor
                                            href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                            target="_blank"
                                            rel="noreferrer noopener"
                                        />
                                    ),
                                }}
                            />
                        </>
                    }
                    description={
                        <>
                            <Trans
                                t={t}
                                i18nKey="connectFlow.unsupported.description"
                                components={{
                                    issuesLink: (
                                        <Anchor
                                            href="https://github.com/lightdash/lightdash/issues"
                                            target="_blank"
                                            rel="noreferrer noopener"
                                        />
                                    ),
                                }}
                            />
                        </>
                    }
                >
                    <Button
                        component="a"
                        href="https://demo.lightdash.com/"
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => {
                            track({ name: EventName.TRY_DEMO_CLICKED });
                        }}
                    >
                        {t('connectFlow.unsupported.tryDemo')}
                    </Button>
                </EmptyState>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};
export default UnsupportedWarehouse;
