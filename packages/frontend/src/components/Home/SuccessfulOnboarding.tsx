import { Toast } from '@blueprintjs/core';
import React, { FC } from 'react';

const SuccessfulOnboarding: FC<{ onDismiss: () => void }> = ({ onDismiss }) => (
    <Toast
        intent="success"
        icon="tick"
        onDismiss={() => onDismiss()}
        timeout={0}
        message={
            <>
                <p
                    style={{
                        fontWeight: 'bold',
                        marginBottom: 5,
                    }}
                >
                    Congratulations! 🎉
                </p>
                <p>
                    You have completed the first essential steps and are now
                    ready to answer your data questions! You can always read our{' '}
                    <a
                        target="_blank"
                        rel="noreferrer"
                        href="https://docs.lightdash.com"
                    >
                        docs
                    </a>{' '}
                    if you need more help!
                </p>
            </>
        }
    />
);

export default SuccessfulOnboarding;
