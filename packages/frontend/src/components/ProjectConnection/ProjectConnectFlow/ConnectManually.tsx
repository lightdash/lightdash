import { Icon, Intent, Position, Radio } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Organisation } from '@lightdash/common';
import { FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CreateProjectConnection } from '..';
import {
    BackToWarehouseButton,
    CreateHeaderWrapper,
    CreateProjectWrapper,
} from '../../../pages/CreateProject.styles';
import RadioGroup from '../../ReactHookForm/RadioGroup';
import InviteExpertFooter from './InviteExpertFooter';
import {
    ButtonLabel,
    ButtonsWrapper,
    Codeblock,
    ConnectWarehouseWrapper,
    HasDimensionsForm,
    LinkToDocsButton,
    SubmitButton,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';
import WareHouseConnectCard, {
    SelectedWarehouse,
} from './WareHouseConnectCard.tsx';

interface Props {
    organisation: Organisation;
}

interface DimensionCardProps {
    onChangeHasDimensions: (hasDimensions: boolean) => void;
}

const DefineDimensionsCard: FC<DimensionCardProps> = ({
    onChangeHasDimensions,
}) => {
    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>You're in! 🎉</Title>

                <Subtitle>
                    We strongly recommend that you define columns in your .yml
                    file for a smoother experience.
                    <br />
                    Don’t worry! You can do this right now:
                </Subtitle>

                <ButtonsWrapper>
                    <Tooltip2
                        position={Position.TOP}
                        content={
                            'Add the columns you want to explore to your .yml files in your dbt project. Click to view docs.'
                        }
                        targetTagName="div"
                    >
                        <LinkToDocsButton
                            href="https://docs.lightdash.com/guides/how-to-create-dimensions"
                            target="_blank"
                        >
                            <ButtonLabel>
                                Learn how to define them manually.
                            </ButtonLabel>

                            <Icon icon="chevron-right" />
                        </LinkToDocsButton>
                    </Tooltip2>
                </ButtonsWrapper>

                <SubmitButton
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="I’ve defined them!"
                    onClick={() => onChangeHasDimensions(true)}
                />
            </ConnectWarehouseWrapper>
            <InviteExpertFooter />
        </Wrapper>
    );
};

const codeBlock = String.raw`models:
- name: my_model
    columns:
    - name: my_column_1
    - name: my_column_2
`;

const DefineDimensionsInstructionsCart: FC<DimensionCardProps> = ({
    onChangeHasDimensions,
}) => {
    const methods = useForm<{ hasDimension: string }>({
        mode: 'onSubmit',
    });

    const handleSubmit = (formData: { hasDimension: string }) => {
        onChangeHasDimensions(formData?.hasDimension === 'Yes');
    };

    return (
        <Wrapper>
            <ConnectWarehouseWrapper>
                <Title>You're in! 🎉</Title>
                <Subtitle>
                    The next step is to connect your data.
                    <br />
                    To see a table in Lightdash, you need to define its
                    <br />
                    columns in a .yml file. eg:
                </Subtitle>

                <Codeblock>
                    <pre>{codeBlock}</pre>
                </Codeblock>

                <HasDimensionsForm
                    name="has-dimensions-selector"
                    methods={methods}
                    onSubmit={handleSubmit}
                    disableSubmitOnEnter
                >
                    <RadioGroup
                        name="hasDimension"
                        label="Have you defined dimensions in your .yml files?"
                        rules={{
                            required: 'Required field',
                        }}
                        defaultValue="hasDimensions"
                    >
                        <Radio label="Yes" value="Yes" />
                        <Radio label="No" value="No" />
                    </RadioGroup>

                    <SubmitButton
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Next"
                    />
                </HasDimensionsForm>
            </ConnectWarehouseWrapper>
            <InviteExpertFooter />
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

const ConnectManually: FC<Props> = ({ organisation }) => {
    const [hasDimensions, setHasDimensions] = useState<boolean>();
    const [selectedWarehouse, setSelectedWarehouse] =
        useState<SelectedWarehouse>();

    return (
        <>
            {!hasDimensions &&
                (hasDimensions === false ? (
                    <DefineDimensionsCard
                        onChangeHasDimensions={setHasDimensions}
                    />
                ) : (
                    <DefineDimensionsInstructionsCart
                        onChangeHasDimensions={setHasDimensions}
                    />
                ))}

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
