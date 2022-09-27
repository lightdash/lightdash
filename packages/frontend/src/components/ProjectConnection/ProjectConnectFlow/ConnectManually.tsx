import { AnchorButton, Button, Intent, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Organisation } from '@lightdash/common';
import { FC, useState } from 'react';
import { CreateProjectConnection } from '..';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import {
    BackToWarehouseButton,
    CreateHeaderWrapper,
    CreateProjectWrapper,
} from '../../../pages/CreateProject.styles';
import {
    ButtonsWrapper,
    Codeblock,
    ConnectWarehouseWrapper,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';
import WareHouseConnectCard, {
    SelectedWarehouse,
} from './WareHouseConnectCard.tsx';

const codeBlock = String.raw`models:
- name: my_model
    columns:
    - name: my_column_1
    - name: my_column_2
`;

interface DimensionCardProps {
    onChangeHasDimensions: (hasDimensions: boolean) => void;
}

const DimensionCard: FC<DimensionCardProps> = ({ onChangeHasDimensions }) => {
    const handleSubmit = () => {
        onChangeHasDimensions(true);
    };

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>You're in! 🎉</Title>
                <Subtitle>
                    We strongly recommend that you define columns in your .yml
                    to see a table in Lightdash. eg:
                </Subtitle>

                <Codeblock>
                    <pre>{codeBlock}</pre>
                </Codeblock>

                <ButtonsWrapper>
                    <Tooltip2
                        position={Position.TOP}
                        content={
                            'Add the columns you want to explore to your .yml files in your dbt project. Click to view docs.'
                        }
                        targetTagName="div"
                    >
                        <AnchorButton
                            large
                            minimal
                            outlined
                            fill
                            href="https://docs.lightdash.com/guides/how-to-create-dimensions"
                            target="_blank"
                            rightIcon="chevron-right"
                        >
                            Learn how to define them
                        </AnchorButton>
                    </Tooltip2>
                </ButtonsWrapper>

                <Button
                    type="submit"
                    large
                    intent={Intent.PRIMARY}
                    text="I’ve defined them!"
                    onClick={handleSubmit}
                />
            </ConnectWarehouseWrapper>
        </Wrapper>
    );
};

interface WarehouseSelectedCardProps {
    organisation: Organisation;
    selectedWarehouse: SelectedWarehouse;
    onSelectWarehouse: (warehouse: SelectedWarehouse | undefined) => void;
}

const WarehouseSelectedCard: FC<WarehouseSelectedCardProps> = ({
    organisation,
    selectedWarehouse,
    onSelectWarehouse,
}) => {
    return (
        <CreateProjectWrapper>
            <CreateHeaderWrapper>
                <BackToWarehouseButton
                    icon="chevron-left"
                    text="Back"
                    onClick={() => onSelectWarehouse(undefined)}
                />

                <Title marginBottom>
                    {`Create a ${selectedWarehouse.label} connection`}
                </Title>
            </CreateHeaderWrapper>

            <CreateProjectConnection
                orgData={organisation}
                selectedWarehouse={selectedWarehouse}
            />
        </CreateProjectWrapper>
    );
};

const ConnectManually: FC = () => {
    const { data: organisation, isLoading } = useOrganisation();
    const [hasDimensions, setHasDimensions] = useState<boolean>();
    const [selectedWarehouse, setSelectedWarehouse] =
        useState<SelectedWarehouse>();

    if (isLoading || !organisation) return null;

    return (
        <>
            {!hasDimensions && (
                <DimensionCard onChangeHasDimensions={setHasDimensions} />
            )}

            {hasDimensions && !selectedWarehouse && (
                <WareHouseConnectCard
                    setWarehouse={setSelectedWarehouse}
                    showDemoLink={organisation.needsProject}
                />
            )}

            {hasDimensions && selectedWarehouse && (
                <WarehouseSelectedCard
                    organisation={organisation}
                    selectedWarehouse={selectedWarehouse}
                    onSelectWarehouse={setSelectedWarehouse}
                />
            )}
        </>
    );
};

export default ConnectManually;
