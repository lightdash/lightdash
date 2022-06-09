import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useState } from 'react';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { CreateProjectConnection } from '../components/ProjectConnection';
import ConnectionOptions from '../components/ProjectConnection/ProjectConnectFlow/ConnectionOptions';
import HowToConnectDataCard from '../components/ProjectConnection/ProjectConnectFlow/HowToConnectDataCard';
import WareHouseConnectCard from '../components/ProjectConnection/ProjectConnectFlow/WareHouseConnectCard.tsx';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useApp } from '../providers/AppProvider';
import {
    BackToWarehouseButton,
    CreateHeaderWrapper,
    CreateProjectWrapper,
    Title,
} from './CreateProject.styles';

export type SelectedWarehouse = {
    label: string;
    key: WarehouseTypes;
    icon: string;
};

const CreateProject: FC = () => {
    const { health } = useApp();
    const [selectedWarehouse, setSelectedWarehouse] = useState<
        SelectedWarehouse | undefined
    >();
    const [hasDimensions, setHasDimensions] = useState<string | undefined>();

    if (health.isLoading) {
        return <PageSpinner />;
    }

    const PanelToRender = () => {
        switch (hasDimensions) {
            case 'hasDimensions':
                return (
                    <>
                        {!selectedWarehouse ? (
                            <WareHouseConnectCard
                                setWarehouse={setSelectedWarehouse}
                                showDemoLink
                            />
                        ) : (
                            <CreateProjectWrapper>
                                <CreateHeaderWrapper>
                                    <BackToWarehouseButton
                                        icon="chevron-left"
                                        text="Back"
                                        onClick={() =>
                                            setSelectedWarehouse(undefined)
                                        }
                                    />
                                    <Title marginBottom>
                                        {`Create a ${selectedWarehouse.label} connection`}
                                    </Title>
                                </CreateHeaderWrapper>
                                <CreateProjectConnection
                                    selectedWarehouse={selectedWarehouse}
                                />
                            </CreateProjectWrapper>
                        )}
                    </>
                );
            case 'doesNotHaveDimensions':
                return (
                    <ConnectionOptions setHasDimensions={setHasDimensions} />
                );
            case undefined:
                return (
                    <HowToConnectDataCard setHasDimensions={setHasDimensions} />
                );
            default:
                return <></>;
        }
    };

    return (
        <Page
            hideFooter={!!selectedWarehouse}
            noContentPadding={!!selectedWarehouse}
        >
            <ProjectFormProvider>
                <PanelToRender />
            </ProjectFormProvider>
        </Page>
    );
};

export default CreateProject;
