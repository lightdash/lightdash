import { Intent } from '@blueprintjs/core';
import { WarehouseTypes } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import { SelectedWarehouse } from '.';
import { BackButton } from '../../../../pages/CreateProject.styles';
import { EventName } from '../../../../types/Events';
import LinkButton from '../../../common/LinkButton';
import InviteExpertFooter from '../InviteExpertFooter';
import BigQuery from './../Assets/bigquery.svg';
import Databricks from './../Assets/databricks.svg';
import PostgressLogo from './../Assets/postgresql.svg';
import Redshift from './../Assets/redshift.svg';
import Snowflake from './../Assets/snowflake.svg';
import {
    ConnectWarehouseWrapper,
    Spacer,
    Subtitle,
    Title,
    WarehouseButton,
    WarehouseGrid,
    WarehouseIcon,
    Wrapper,
} from './../ProjectConnectFlow.styles';

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

interface ConnectManuallyStep2Props {
    needsProject: boolean;
    onSelectWarehouse: (warehouse: SelectedWarehouse) => void;
    onBack: () => void;
}

const ConnectManuallyStep2: FC<ConnectManuallyStep2Props> = ({
    needsProject,
    onSelectWarehouse,
    onBack,
}) => {
    const [warehouseInfo, setWarehouseInfo] = useState<
        SelectedWarehouse[] | undefined
    >();

    useMemo(() => setWarehouseInfo(WarehouseTypeLabels), []);

    return (
        <Wrapper>
            <BackButton icon="chevron-left" text="Back" onClick={onBack} />

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
                            onClick={() => onSelectWarehouse(item)}
                        >
                            {item.label}
                        </WarehouseButton>
                    ))}
                </WarehouseGrid>

                {needsProject && (
                    <>
                        <Spacer $height={20} />

                        <LinkButton
                            minimal
                            intent={Intent.PRIMARY}
                            href="https://demo.lightdash.com/"
                            target="_blank"
                            trackingEvent={{
                                name: EventName.TRY_DEMO_CLICKED,
                            }}
                        >
                            ...or try our demo project instead
                        </LinkButton>
                    </>
                )}
            </ConnectWarehouseWrapper>

            <InviteExpertFooter />
        </Wrapper>
    );
};
export default ConnectManuallyStep2;
