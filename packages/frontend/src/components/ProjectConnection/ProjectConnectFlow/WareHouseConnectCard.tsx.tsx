import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import UserSettingsModal from '../../UserSettingsModal';
import BigQuery from './Assets/bigquery.svg';
import Databricks from './Assets/databricks.svg';
import PostgressLogo from './Assets/postgresql.svg';
import Redshift from './Assets/redshift.svg';
import Snowflake from './Assets/snowflake.svg';
import {
    ConnectWarehouseWrapper,
    ExternalLink,
    FormFooterCopy,
    InviteLinkButton,
    Subtitle,
    Title,
    WarehouseButton,
    WarehouseGrid,
    WarehouseIcon,
    Wrapper,
} from './ProjectConnectFlow.styles';
export type SelectedWarehouse = {
    label: string;
    key: WarehouseTypes;
    icon: string;
};
interface Props {
    setWarehouse: (warehouse: SelectedWarehouse) => void;
    showDemoLink?: boolean;
}

export const WarehouseTypeLabels = [
    {
        label: 'BigQuery',
        key: WarehouseTypes.BIGQUERY,
        icon: BigQuery,
    },
    {
        label: 'Databricks',
        key: WarehouseTypes.DATABRICKS,
        icon: Databricks,
    },
    {
        label: 'PostgreSQL',
        key: WarehouseTypes.POSTGRES,
        icon: PostgressLogo,
    },
    {
        label: 'Redshift',
        key: WarehouseTypes.REDSHIFT,
        icon: Redshift,
    },
    {
        label: 'Snowflake',
        key: WarehouseTypes.SNOWFLAKE,
        icon: Snowflake,
    },
];

const WareHouseConnectCard: FC<Props> = ({ setWarehouse, showDemoLink }) => {
    const [warehouseInfo, setWarehouseInfo] = useState<
        SelectedWarehouse[] | undefined
    >();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showInvitePage, setShowInvitePage] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>();

    useMemo(() => {
        setWarehouseInfo(WarehouseTypeLabels);
    }, []);

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>Connect your project</Title>
                <Subtitle>Select your warehouse:</Subtitle>
                <WarehouseGrid>
                    {warehouseInfo?.map((item) => (
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
                {showDemoLink && (
                    <ExternalLink
                        href="https://demo.lightdash.com/"
                        target="_blank"
                    >
                        ...or try our demo project instead
                    </ExternalLink>
                )}
            </ConnectWarehouseWrapper>
            {showDemoLink && (
                <FormFooterCopy>
                    This step is best carried out by your organization’s
                    analytics experts. If this is not you,{' '}
                    <InviteLinkButton
                        onClick={() => {
                            setIsSettingsOpen(true);
                            setActiveTab('userManagement');
                        }}
                    >
                        invite them to Lightdash!
                    </InviteLinkButton>
                </FormFooterCopy>
            )}
            <UserSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                activeTab={activeTab}
                onChangeTab={(tab) => {
                    setActiveTab(tab);
                    setShowInvitePage(false);
                }}
                panelProps={{
                    userManagementProps: {
                        showInvitePage,
                        setShowInvitePage,
                    },
                }}
            />
        </Wrapper>
    );
};
export default WareHouseConnectCard;
