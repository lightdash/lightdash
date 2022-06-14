import React, { FC, useState } from 'react';
import UserSettingsModal from '../../UserSettingsModal';
import { FormFooterCopy, InviteLinkButton } from './ProjectConnectFlow.styles';

const InviteExpertFooter: FC = () => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showInvitePage, setShowInvitePage] = useState(false);
    const [activeTab, setActiveTab] = useState<string | undefined>();
    return (
        <>
            <FormFooterCopy>
                This step is best carried out by your organization’s analytics
                experts. If this is not you,{' '}
                <InviteLinkButton
                    onClick={() => {
                        setActiveTab('userManagement');
                        setShowInvitePage(true);
                        setIsSettingsOpen(true);
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
        </>
    );
};

export default InviteExpertFooter;
