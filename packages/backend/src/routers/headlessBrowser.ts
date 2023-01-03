import { ForbiddenError } from '@lightdash/common';
import { createHmac } from 'crypto';
import express from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { userModel } from '../models/models';
import { EncryptionService } from '../services/EncryptionService/EncryptionService';

const puppeteer = require('puppeteer');

export const headlessBrowserRouter = express.Router({ mergeParams: true });
export const encryptionService = new EncryptionService({ lightdashConfig });

export const getAuthenticationToken = (value: string) =>
    createHmac('sha512', lightdashConfig.lightdashSecret)
        .update(value)
        .digest('hex');

headlessBrowserRouter.post('/login/:userUuid', async (req, res, next) => {
    try {
        const { userUuid } = req.params;
        const hash = getAuthenticationToken(userUuid);

        if (hash !== req.body.token) {
            throw new ForbiddenError();
        }
        const sessionUser = await userModel.findSessionUserByUUID(userUuid);

        req.login(sessionUser, (err) => {
            if (err) {
                next(err);
            }
            res.json({
                status: 'ok',
                results: sessionUser,
            });
        });
    } catch (e) {
        next(e);
    }
});

// Extra endpoints for headless-chrome testing on Render
if (
    process.env.NODE_ENV === 'development' ||
    process.env.IS_PULL_REQUEST === 'true'
) {
    headlessBrowserRouter.get('/callback/:flag', async (req, res, next) => {
        // Returns json with the same argument specified in flag
        // Wait a random number of seconds between 0 an 1, to ensure the response can overlap with other requests.
        const delay = Math.floor(Math.random() * 1000);

        setTimeout(() => {
            res.json({
                flag: req.params.flag,
                delay,
            });
        }, delay);
    });

    headlessBrowserRouter.get('/test/:flag', async (req, res, next) => {
        let browser;

        try {
            const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
            console.debug(`Headless chrome endpoint: ${browserWSEndpoint}`);
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();
            const hostname =
                process.env.NODE_ENV === 'development'
                    ? 'lightdash-dev'
                    : process.env.RENDER_SERVICE_NAME;

            const testUrl = `http://${hostname}:${
                process.env.PORT || 3000
            }/api/v1/headless-browser/callback/${req.params.flag}`;
            console.debug(`Fetching headless chrome URL: ${testUrl}`);

            const response = await page.goto(testUrl, {});
            const result = await response.json();

            res.json({
                response: result,
                request: {
                    flag: req.params.flag,
                    browser: browserWSEndpoint,
                    url: testUrl,
                },
            });
        } catch (e) {
            console.error(e);
            next(e.message);
        } finally {
            if (browser) await browser.close();
        }
    });

    headlessBrowserRouter.get('/image/', async (req, res, next) => {
        let browser;

        const isDashboard = false;

        const url = isDashboard
            ? 'http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/dashboards/07914c8f-4dd5-41de-ae48-62f2c711b667/view'
            : // : 'http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/saved/7688b558-3c17-4b96-8f55-af7755be9f12/' // normal chart
              // : 'http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/saved/cacddbc1-faf0-496c-9ca1-b5ac0feb6636' // table
              // : 'http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/saved/e3877884-11f2-4208-b623-6e4d65624e56' //bignumber
              'http://lightdash-dev:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/tables/payments?create_saved_chart_version=%7B%22uuid%22%3A%22cacddbc1-faf0-496c-9ca1-b5ac0feb6636%22%2C%22projectUuid%22%3A%223675b69e-8324-4110-bdca-059031aa8da3%22%2C%22name%22%3A%22Which+customers+have+not+recently+ordered+an+item%3F%22%2C%22description%22%3A%22A+table+of+the+20+customers+that+least+recently+placed+an+order+with+us%22%2C%22tableName%22%3A%22payments%22%2C%22updatedAt%22%3A%222022-12-05T14%3A21%3A29.871Z%22%2C%22updatedByUser%22%3A%7B%22userUuid%22%3A%22b264d83a-9000-426a-85ec-3f9c20f368ce%22%2C%22firstName%22%3A%22David%22%2C%22lastName%22%3A%22Attenborough%22%7D%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22customers_customer_id%22%2C%22customers_days_since_last_order%22%2C%22customers_days_between_created_and_first_order%22%5D%2C%22metrics%22%3A%5B%22payments_total_revenue%22%2C%22payments_unique_payment_count%22%5D%2C%22filters%22%3A%7B%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22customers_days_since_last_order%22%2C%22descending%22%3Afalse%7D%5D%2C%22limit%22%3A500%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22table%22%2C%22config%22%3A%7B%22showColumnCalculation%22%3Afalse%2C%22showTableNames%22%3Atrue%2C%22columns%22%3A%7B%7D%2C%22hideRowNumbers%22%3Afalse%7D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22customers_customer_id%22%2C%22customers_days_since_last_order%22%2C%22customers_days_between_created_and_first_order%22%2C%22payments_total_revenue%22%2C%22payments_unique_payment_count%22%5D%7D%2C%22spaceUuid%22%3A%22bb3824a8-9465-490c-91b7-3d51408a9668%22%2C%22spaceName%22%3A%22Jaffle+shop%22%7D'; // explore
        try {
            const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
            console.debug(`Headless chrome endpoint: ${browserWSEndpoint}`);
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();
            await page.setExtraHTTPHeaders({
                cookie: req.headers.cookie || '',
            });

            await page.setViewport({
                width: 1400,
                height: 768, // hardcoded
            });

            const blockedUrls = [
                'headwayapp.co',
                'rudderlabs.com',
                'analytics.lightdash.com',
                'cohere.so',
                'intercom.io',
            ];
            await page.setRequestInterception(true);
            page.on('request', (request: any) => {
                const requestUrl = request.url();
                if (blockedUrls.includes(requestUrl)) {
                    request.abort();
                    return;
                }

                request.continue();
            });
            await page.goto(url, {
                timeout: 100000,
                waitUntil: 'networkidle0',
            });

            const selector = isDashboard
                ? '.react-grid-layout'
                : `.echarts-for-react, [data-testid="visualization"]`; // Get .echarts-for-react, otherwise fallsback to data-testid (tables and bignumbers)
            await page.waitForSelector(selector);
            const element = await page.$(selector);
            if (isDashboard) {
                await page.evaluate((sel: any) => {
                    // @ts-ignore
                    const elements = document.querySelectorAll(sel);
                    elements.forEach((el) => el.parentNode.removeChild(el));
                }, '.bp4-navbar');
            }
            const imageBuffer = await element.screenshot({
                path: '/tmp/test-screenshot.png',
            });

            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': imageBuffer.length,
            });
            res.end(imageBuffer);
        } catch (e) {
            console.error(e);
            next(e.message);
        } finally {
            if (browser) await browser.close();
        }
    });
}
