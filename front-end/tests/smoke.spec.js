import { test, expect } from '@playwright/test';

test.describe('Cosplay AI - Smoke Tests', () => {
    test('homepage loads', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('body')).toBeVisible();

        await expect(
            page.getByRole('link', { name: 'Cosplay.' })
        ).toBeVisible();
    });

    test('products page loads', async ({ page }) => {
        await page.goto('/products');

        await expect(page.locator('body')).toBeVisible();

        await expect(
            page.getByRole('link', { name: 'Cosplay.' })
        ).toBeVisible();
    });

    test('cart page loads', async ({ page }) => {
        await page.goto('/cart');

        await expect(page.locator('body')).toBeVisible();
    });

    test('AI Design page loads', async ({ page }) => {
        await page.goto('/ai-design');

        await expect(page.locator('body')).toBeVisible();
    });

    test('login page loads', async ({ page }) => {
        await page.goto('/login');

        await expect(page.locator('body')).toBeVisible();
    });

    test('register page loads', async ({ page }) => {
        await page.goto('/register');

        await expect(page.locator('body')).toBeVisible();
    });

    test('saved designs page loads', async ({ page }) => {
        await page.goto('/saved-designs');

        await expect(page.locator('body')).toBeVisible();
    });
});