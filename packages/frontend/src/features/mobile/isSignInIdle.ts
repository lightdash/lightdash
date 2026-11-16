import { type useMobileSignInCode } from './useMobileSignInCode';

type SignIn = ReturnType<typeof useMobileSignInCode>;

export const isSignInIdle = (signIn: SignIn) =>
    signIn.phase === 'showing' ||
    (signIn.phase === 'hidden' && signIn.isMinting);
