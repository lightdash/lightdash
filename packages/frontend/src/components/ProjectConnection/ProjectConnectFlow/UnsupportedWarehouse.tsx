import { H6, Intent, NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import { BackButton } from '../../../pages/CreateProject.styles';
import { EventName } from '../../../types/Events';
import LinkButton from '../../common/LinkButton';
import InviteExpertFooter from './InviteExpertFooter';
import { ConnectWarehouseWrapper, Wrapper } from './ProjectConnectFlow.styles';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
    return (
        <Wrapper>
            <BackButton icon="chevron-left" text="Back" onClick={onBack} />

            <ConnectWarehouseWrapper>
                <NonIdealState
                    icon="error"
                    title={
                        <H6>
                            We only support warehouses that have{' '}
                            <a
                                href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                target="_blank"
                                rel="noreferrer"
                            >
                                verified dbt adapters
                            </a>{' '}
                            for now
                        </H6>
                    }
                    description={
                        <>
                            You can vote on your warehouse in our{' '}
                            <a
                                href="https://github.com/lightdash/lightdash/issues"
                                target="_blank"
                                rel="noreferrer"
                            >
                                GitHub issues
                            </a>{' '}
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
                            try our demo project
                        </LinkButton>
                    }
                />
            </ConnectWarehouseWrapper>

            <InviteExpertFooter />
        </Wrapper>
    );
};
export default UnsupportedWarehouse;
