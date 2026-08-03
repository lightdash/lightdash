import { type FC } from 'react';
import { Navigate } from 'react-router';
import AuthLayout from '../components/common/AuthLayout';
import PageSpinner from '../components/PageSpinner';
import useApp from '../providers/App/useApp';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

const PasswordRecovery: FC = () => {
    const { health } = useApp();

    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={{ pathname: '/' }} />;
    }

    return (
        <AuthLayout pageTitle="Recover password">
            <PasswordRecoveryForm />
        </AuthLayout>
    );
};

export default PasswordRecovery;
