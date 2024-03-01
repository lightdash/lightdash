import { enableFetchMocks } from 'jest-fetch-mock';
import {lightdashConfigMock} from "./src/config/lightdashConfig.mock";

enableFetchMocks();

jest.mock('./src/config/lightdashConfig', () => ({
    lightdashConfig: lightdashConfigMock,
}));