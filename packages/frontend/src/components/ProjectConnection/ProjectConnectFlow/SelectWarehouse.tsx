import { Colors } from '@blueprintjs/core';
import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { ReactComponent as BigQuery } from './Assets/bigquery.svg';
import { ReactComponent as Databricks } from './Assets/databricks.svg';
import { ReactComponent as PostgreSQL } from './Assets/postgresql.svg';
import { ReactComponent as Redshift } from './Assets/redshift.svg';
import { ReactComponent as Snowflake } from './Assets/snowflake.svg';
import { ReactComponent as Trino } from './Assets/trino.svg';
import ConnectTitle from './ConnectTitle';
import InviteExpertFooter from './InviteExpertFooter';
import {
    ConnectWarehouseWrapper,
    OtherIcon,
    Subtitle,
    WarehouseButton,
    WarehouseGrid,
    WarehouseIconWrapper,
    Wrapper,
} from './ProjectConnectFlow.styles';

export enum OtherWarehouse {
    Other = 'Other',
}

export const WarehouseTypeLabels = [
    {
        label: 'BigQuery',
        key: WarehouseTypes.BIGQUERY,
        icon: (
            <WarehouseIconWrapper>
                <BigQuery />
            </WarehouseIconWrapper>
        ),
    },
    {
        label: 'Trino',
        key: WarehouseTypes.TRINO,
        icon: (
            <WarehouseIconWrapper>
                <Trino />
            </WarehouseIconWrapper>
        ),
    },
    {
        label: 'Databricks',
        key: WarehouseTypes.DATABRICKS,
        icon: (
            <WarehouseIconWrapper>
                <Databricks />
            </WarehouseIconWrapper>
        ),
    },
    {
        label: 'PostgreSQL',
        key: WarehouseTypes.POSTGRES,
        icon: (
            <WarehouseIconWrapper>
                <PostgreSQL />
            </WarehouseIconWrapper>
        ),
    },
    {
        label: 'Redshift',
        key: WarehouseTypes.REDSHIFT,
        icon: (
            <WarehouseIconWrapper>
                <Redshift />
            </WarehouseIconWrapper>
        ),
    },
    {
        label: 'Snowflake',
        key: WarehouseTypes.SNOWFLAKE,
        icon: (
            <WarehouseIconWrapper>
                <Snowflake />
            </WarehouseIconWrapper>
        ),
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
