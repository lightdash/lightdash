import { Colors } from '@blueprintjs/core';
import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import BigQuery from './Assets/bigquery.svg';
import Databricks from './Assets/databricks.svg';
import PostgressLogo from './Assets/postgresql.svg';
import Redshift from './Assets/redshift.svg';
import Snowflake from './Assets/snowflake.svg';
import Trino from './Assets/trino.svg';
import ConnectTitle from './ConnectTitle';
import InviteExpertFooter from './InviteExpertFooter';
import {
    ConnectWarehouseWrapper,
    OtherIcon,
    Subtitle,
    WarehouseButton,
    WarehouseGrid,
    WarehouseIcon,
    Wrapper,
} from './ProjectConnectFlow.styles';

export enum OtherWarehouse {
    Other = 'Other',
}

export const WarehouseTypeLabels = [
    {
        label: 'BigQuery',
        key: WarehouseTypes.BIGQUERY,
        icon: <WarehouseIcon src={BigQuery} alt="BigQuery" />,
    },
    {
        label: 'Trino',
        key: WarehouseTypes.TRINO,
        icon: <WarehouseIcon src={Trino} alt="Trino" />,
    },
    {
        label: 'Databricks',
        key: WarehouseTypes.DATABRICKS,
        icon: <WarehouseIcon src={Databricks} alt="Databricks" />,
    },
    {
        label: 'PostgreSQL',
        key: WarehouseTypes.POSTGRES,
        icon: <WarehouseIcon src={PostgressLogo} alt="Postgres" />,
    },
    {
        label: 'Redshift',
        key: WarehouseTypes.REDSHIFT,
        icon: <WarehouseIcon src={Redshift} alt="Redshift" />,
    },
    {
        label: 'Snowflake',
        key: WarehouseTypes.SNOWFLAKE,
        icon: <WarehouseIcon src={Snowflake} alt="Snowflake" />,
    },
    {
        label: 'Other',
        key: OtherWarehouse.Other,
        icon: <OtherIcon icon="more" color={Colors.GRAY3} />,
    },
] as const;

export type SelectedWarehouse = typeof WarehouseTypeLabels[number]['key'];

export const getWarehouseLabel = (key: SelectedWarehouse) => {
    return WarehouseTypeLabels.find((w) => w.key === key)!;
};

interface SelectWarehouseProps {
    isCreatingFirstProject: boolean;
    onSelect: (warehouse: SelectedWarehouse) => void;
}

const SelectWarehouse: FC<SelectWarehouseProps> = ({
    isCreatingFirstProject,
    onSelect,
}) => {
    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <ConnectTitle isCreatingFirstProject={isCreatingFirstProject} />

                <Subtitle>Select your warehouse:</Subtitle>

                <WarehouseGrid>
                    {WarehouseTypeLabels.map((item) => (
                        <WarehouseButton
                            key={item.key}
                            outlined
                            icon={item.icon}
                            onClick={() => onSelect(item.key)}
                        >
                            {item.label}
                        </WarehouseButton>
                    ))}
                </WarehouseGrid>
            </ConnectWarehouseWrapper>

            <InviteExpertFooter />
        </Wrapper>
    );
};
export default SelectWarehouse;
