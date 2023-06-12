import { H6, Intent, NonIdealState } from '@blueprintjs/core';
import { Anchor } from '@mantine/core';
import { FC } from 'react';
import { FloatingBackButton } from '../../../pages/CreateProject.styles';
import { EventName } from '../../../types/Events';
import LinkButton from '../../common/LinkButton';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import { Wrapper } from './ProjectConnectFlow.styles';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
    return (
        <Wrapper>
            <FloatingBackButton
                icon="chevron-left"
                text="Back"
                onClick={onBack}
            />

            <ProjectCreationCard>
                <NonIdealState
                    icon="error"
                    title={
                        <H6>
                            We only support warehouses that have{' '}
                            <Anchor
                                href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                target="_blank"
                                rel="noreferrer"
                            >
                                verified dbt adapters
                            </Anchor>{' '}
                            for now
                        </H6>
                    }
                    description={
                        <>
                            You can vote on your warehouse in our{' '}
                            <Anchor
                                href="https://github.com/lightdash/lightdash/issues"
                                target="_blank"
                                rel="noreferrer"
                            >
                                GitHub issues
                            </Anchor>{' '}
                            or create a new issue if you can't see yours there.
                        </>
                    }
                    action={
                        <LinkButton
                            intent={Intent.PRIMARY}
                            href="https://demo.lightdash.com/"
                            target="_blank"
                            trackingEvent={{
                                name: EventName.TRY_DEMO_CLICKED,
                            }}
                        >
                            Try our demo project
                        </LinkButton>
                    }
                />
            </ProjectCreationCard>
        </Wrapper>
    );
};
export default UnsupportedWarehouse;
