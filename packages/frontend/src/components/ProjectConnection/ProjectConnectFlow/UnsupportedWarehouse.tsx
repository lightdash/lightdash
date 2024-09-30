import { Anchor, Avatar, Button } from '@mantine/core';
import { IconChevronLeft, IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingWrapper from './common/OnboardingWrapper';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
    const { track } = useTracking();

    return (
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-50}
                leftIcon={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                Back
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
                            We only support warehouses that have{' '}
                            <Anchor
                                href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                verified dbt adapters
                            </Anchor>{' '}
                            for now
                        </>
                    }
                    description={
                        <>
                            You can vote on your warehouse in our{' '}
                            <Anchor
                                href="https://github.com/lightdash/lightdash/issues"
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                GitHub issues
                            </Anchor>{' '}
                            or create a new issue if you can't see yours there.
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
                        Try our demo project
                    </Button>
                </EmptyState>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};
export default UnsupportedWarehouse;
