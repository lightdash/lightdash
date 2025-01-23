import { bruno } from '@lightdash/common';
import App from './App';
import { lightdashConfig } from './config/lightdashConfig';
import knexConfig from './knexfile';

const test = (_arg: number) => {
    console.log('alalala');
    return Promise.resolve(1);
};

const numPromise = (num: number) => Promise.resolve(num);

const test2 = async () => {
    console.log('alalala2');

    console.log(bruno());

    const alalal2 = await test(await numPromise(1));
    return alalal2;
};

const app = new App({
    lightdashConfig,
    port: process.env.PORT || 8080,
    environment:
        process.env.NODE_ENV === 'development' ? 'development' : 'production',
    knexConfig,
});

test2().then(console.log).catch(console.error);

export default app;
