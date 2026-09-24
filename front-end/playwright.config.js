import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',

    timeout: 30_000,

    expect: {
        timeout: 5_000,
    },

    fullyParallel: false,

    forbidOnly: !!process.env.CI,

    retries: process.env.CI ? 2 : 0,

    workers: 1,

    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report' }],
    ],

    use: {
        baseURL: 'http://localhost:5177',

        trace: 'on-first-retry',

        screenshot: 'only-on-failure',

        video: 'retain-on-failure',

        headless: true,
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
});