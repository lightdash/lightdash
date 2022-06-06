import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useState } from 'react';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { CreateProjectConnection } from '../components/ProjectConnection';
import { ProjectFormProvider } from '../components/ProjectConnection/ProjectFormProvider';
import { useApp } from '../providers/AppProvider';
import {
    BackToWarehouseButton,
    ConnectWarehouseWrapper,
    CreateProjectWrapper,
    ExternalLink,
    Subtitle,
    Title,
    WarehouseButton,
    WarehouseGrid,
    WarehouseIcon,
    Wrapper,
} from './CreateProject.styles';

const WarehouseTypeLabels = [
    { label: 'Bigquery', key: WarehouseTypes.BIGQUERY, icon: './bigquery.png' },
    {
        label: 'Databricks',
        key: WarehouseTypes.DATABRICKS,
        icon: './databricks.png',
    },
    {
        label: 'PostgreSQL',
        key: WarehouseTypes.POSTGRES,
        icon: './postgresql.png',
    },
    { label: 'Redshift', key: WarehouseTypes.REDSHIFT, icon: './redshift.png' },
    {
        label: 'Snowflake',
        key: WarehouseTypes.SNOWFLAKE,
        icon: './snowflake.png',
    },
];

export type SelectedWarehouse = {
    label: string;
    key: WarehouseTypes;
    icon: string;
};

interface WareHouseConnectCardProps {
    setWarehouse: (warehouse: SelectedWarehouse) => void;
}

const WareHouseConnectCard: FC<WareHouseConnectCardProps> = ({
    setWarehouse,
}) => {
    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>Connect your project</Title>
                <Subtitle>Select your warehouse:</Subtitle>
                <WarehouseGrid>
                    {WarehouseTypeLabels.map((item) => (
                        <WarehouseButton
                            key={item.key}
                            outlined
                            icon={
                                <WarehouseIcon src={item.icon} alt={item.key} />
                            }
                            onClick={() => setWarehouse(item)}
                        >
                            {item.label}
                        </WarehouseButton>
                    ))}
                </WarehouseGrid>
                <ExternalLink
                    href="https://demo.lightdash.com/"
                    target="_blank"
                >
                    ...or try our demo project instead
                </ExternalLink>
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

const CreateProject: FC = () => {
    const { health } = useApp();
    const [selectedWarehouse, setSelectedWarehouse] = useState<
        SelectedWarehouse | undefined
    >();

    if (health.isLoading) {
        return <PageSpinner />;
    }

    return (
        <Page>
            <ProjectFormProvider>
                {!selectedWarehouse ? (
                    <WareHouseConnectCard setWarehouse={setSelectedWarehouse} />
                ) : (
                    <CreateProjectWrapper>
                        <BackToWarehouseButton
                            icon="chevron-left"
                            text="Back"
                            onClick={() => setSelectedWarehouse(undefined)}
                        />
                        <Title marginBottom>
                            {`Create a ${selectedWarehouse.label} connection`}
                        </Title>
                        <CreateProjectConnection
                            selectedWarehouse={selectedWarehouse}
                        />
                    </CreateProjectWrapper>
                )}
            </ProjectFormProvider>
        </Page>
    );
};

export default CreateProject;
