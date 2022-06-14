import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { CreateProjectConnection } from '../components/ProjectConnection';
import ConnectionOptions from '../components/ProjectConnection/ProjectConnectFlow/ConnectionOptions';
import HowToConnectDataCard from '../components/ProjectConnection/ProjectConnectFlow/HowToConnectDataCard';
import WareHouseConnectCard from '../components/ProjectConnection/ProjectConnectFlow/WareHouseConnectCard.tsx';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
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
    const { isLoading, data: orgData } = useOrganisation();
    const [selectedWarehouse, setSelectedWarehouse] = useState<
        SelectedWarehouse | undefined
    >();
    const [hasDimensions, setHasDimensions] = useState<string>();

    useEffect(() => {
        if (orgData && !orgData.needsProject) {
            setHasDimensions('hasDimensions');
        }
    }, [orgData]);

    if (health.isLoading || isLoading) {
        return <PageSpinner />;
    }

    return (
        <Page
            hideFooter={!!selectedWarehouse}
            noContentPadding={!!selectedWarehouse}
        >
            <ProjectFormProvider>
                {hasDimensions === 'hasDimensions' && (
                    <>
                        {!selectedWarehouse ? (
                            <WareHouseConnectCard
                                setWarehouse={setSelectedWarehouse}
                                showDemoLink={orgData?.needsProject}
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
                                    orgData={orgData}
                                    selectedWarehouse={selectedWarehouse}
                                />
                            </CreateProjectWrapper>
                        )}
                    </>
                )}
                {hasDimensions === 'doesNotHaveDimensions' && (
                    <ConnectionOptions setHasDimensions={setHasDimensions} />
                )}
                {!hasDimensions && (
                    <HowToConnectDataCard setHasDimensions={setHasDimensions} />
                )}
            </ProjectFormProvider>
        </Page>
    );
};

export default CreateProject;
