import { Intent, Radio } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import RadioGroup from '../../ReactHookForm/RadioGroup';
import UserSettingsModal from '../../UserSettingsModal';
import {
    Codeblock,
    ConnectWarehouseWrapper,
    FormFooterCopy,
    HasDimensionsForm,
    InviteLinkButton,
    SubmitButton,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';

interface Props {
    setHasDimensions: (dimension: string) => void;
}

const codeBlock = String.raw`models:
- name: my_model
    columns:
    - name: my_column_1
    - name: my_column_2
`;

const HowToConnectDataCard: FC<Props> = ({ setHasDimensions }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showInvitePage, setShowInvitePage] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>();
    const methods = useForm<{ hasDimension: string }>({
        mode: 'onSubmit',
    });

    const onSubmit = (formData: { hasDimension: string }) => {
        setHasDimensions(formData?.hasDimension);
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
                    onSubmit={onSubmit}
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
                        <Radio label="Yes" value="hasDimensions" />
                        <Radio label="No" value="doesNotHaveDimensions" />
                    </RadioGroup>
                    <SubmitButton
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Next"
                    />
                </HasDimensionsForm>
            </ConnectWarehouseWrapper>
            <FormFooterCopy>
                This step is best carried out by your organization’s analytics
                experts. If this is not you,{' '}
                <InviteLinkButton
                    onClick={() => {
                        setIsSettingsOpen(true);
                        setActiveTab('userManagement');
                    }}
                >
                    invite them to Lightdash!
                </InviteLinkButton>
            </FormFooterCopy>
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
export default HowToConnectDataCard;
