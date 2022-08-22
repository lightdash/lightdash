import { FC } from 'react';
import { NavLink } from 'react-router-dom';
import { FormFooterCopy, InviteLinkButton } from './ProjectConnectFlow.styles';

const InviteExpertFooter: FC = () => (
    <>
        <FormFooterCopy>
            This step is best carried out by your organization’s analytics
            experts. If this is not you,{' '}
            <NavLink to={`/generalSettings/userManagement?to=invite`}>
                <InviteLinkButton>invite them to Lightdash!</InviteLinkButton>
            </NavLink>
        </FormFooterCopy>
    </>
);

export default InviteExpertFooter;
