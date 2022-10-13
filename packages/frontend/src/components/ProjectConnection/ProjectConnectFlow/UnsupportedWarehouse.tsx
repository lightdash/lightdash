import { Intent, NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import { BackButton } from '../../../pages/CreateProject.styles';
import { EventName } from '../../../types/Events';
import LinkButton from '../../common/LinkButton';
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
                    description={
                        <>
                            <p>
                                We only support warehouses that have{' '}
                                <a
                                    href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                    target="_blank" rel="noreferrer"
                                >
                                    verified dbt adapters
                                </a>{' '}
                                for now. You can vote on your warehouse in our{' '}
                                <a
                                    href="https://github.com/lightdash/lightdash/issues"
                                    target="_blank" rel="noreferrer"
                                >
                                    GitHub issues
                                </a>{' '}
                                or create a new issue if you can't see yours
                                there.
                            </p>

                            <p>
                                In the meantime, you can try using our demo
                                project to test out Lightdash.
                            </p>
                        </>
                    }
                ></NonIdealState>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};
export default UnsupportedWarehouse;
