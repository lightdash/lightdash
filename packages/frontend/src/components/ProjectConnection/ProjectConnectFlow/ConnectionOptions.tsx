import { Icon, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import UserSettingsModal from '../../UserSettingsModal';
import {
    ButtonLabel,
    ButtonsWrapper,
    ConnectWarehouseWrapper,
    FormFooterCopy,
    InviteLinkButton,
    LinkToDocsButton,
    SubmitButton,
    Subtitle,
    Title,
    Wrapper,
} from './ProjectConnectFlow.styles';

interface Props {
    setHasDimensions: (dimension: string) => void;
}

const ConnectionOptions: FC<Props> = ({ setHasDimensions }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showInvitePage, setShowInvitePage] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>();
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
                        content={
                            'Our tool makes its super easy to set up your dbt project. Check it out now!'
                        }
                        targetTagName="div"
                    >
                        <LinkToDocsButton
                            href="https://docs.lightdash.com/get-started/setup-lightdash/lightdash-cli"
                            target="_blank"
                        >
                            <ButtonLabel>
                                By using our handy CLI tool
                            </ButtonLabel>
                            <Icon icon="chevron-right" />
                        </LinkToDocsButton>
                    </Tooltip2>
                    <Tooltip2
                        content={
                            'Add the columns you want to explore to your .yml files in your dbt project. Click to view docs.'
                        }
                        targetTagName="div"
                    >
                        <LinkToDocsButton
                            href="https://docs.lightdash.com/get-started/setup-lightdash/add-metrics/#2-add-a-metric-to-your-project"
                            target="_blank"
                        >
                            <ButtonLabel>
                                ...or by adding them manually.
                            </ButtonLabel>
                            <Icon icon="chevron-right" />
                        </LinkToDocsButton>
                    </Tooltip2>
                </ButtonsWrapper>
                <SubmitButton
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="I’ve defined them!"
                    onClick={() => setHasDimensions('hasDimensions')}
                />
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

export default ConnectionOptions;
