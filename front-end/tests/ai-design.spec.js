import { test, expect } from '@playwright/test';

test.describe('Cosplay AI - AI Design Workflow', () => {
    test('complete AI design workflow', async ({ page }) => {
        // --------------------------------------------------
        // Mock the AI image generation API
        // --------------------------------------------------
        await page.route('**/generate-design', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    mimeType: 'image/png',
                    imageBase64:
                        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                }),
            });
        });

        // --------------------------------------------------
        // Open AI Design page
        // --------------------------------------------------
        await page.goto('/ai-design');

        await expect(
            page.getByRole('heading', {
                name: 'Select Garment Type',
            })
        ).toBeVisible();

        // --------------------------------------------------
        // Step 1: Select garment
        // --------------------------------------------------
        await page.getByRole('button', {
            name: 'T-Shirt',
            exact: true,
        }).click();

        // --------------------------------------------------
        // Step 2: Select brand
        // --------------------------------------------------
        await expect(
            page.getByRole('heading', {
                name: 'Select Brand',
            })
        ).toBeVisible();

        const brandButtons = page.locator(
            '.wf-grid--3 .wf-card-btn'
        );

        await expect(
            brandButtons.first()
        ).toBeVisible();

        await brandButtons.first().click();

        // --------------------------------------------------
        // Step 3: Select size
        // --------------------------------------------------
        await expect(
            page.getByRole('heading', {
                name: 'Select Size',
            })
        ).toBeVisible();

        const sizeButtons = page.locator(
            '.wf-size-btn'
        );

        await expect(
            sizeButtons.first()
        ).toBeVisible();

        await sizeButtons.first().click();

        // --------------------------------------------------
        // Step 4: Fit adjustment
        // --------------------------------------------------
        await expect(
            page.getByRole('heading', {
                name: 'Fit Adjustment',
            })
        ).toBeVisible();

        // Wait for the measurement controls.
        await expect(
            page.getByRole('button', {
                name: 'Save Measurements',
            })
        ).toBeVisible({
            timeout: 10000,
        });

        // Save measurements.
        await page.getByRole('button', {
            name: 'Save Measurements',
        }).click();

        // The UI now switches to the confirmed-fit state.
        await expect(
            page.getByText('Fit confirmed', {
                exact: false,
            })
        ).toBeVisible();

        // Continue to the design step.
        await expect(
            page.getByRole('button', {
                name: 'Continue to Design →',
            })
        ).toBeVisible();

        await page.getByRole('button', {
            name: 'Continue to Design →',
        }).click();

        // --------------------------------------------------
        // Step 5: Design prompt
        // --------------------------------------------------
        await expect(
            page.getByRole('heading', {
                name: 'Design Your Garment',
            })
        ).toBeVisible();

        const prompt = page.locator(
            'textarea.wf-prompt-textarea'
        );

        await expect(
            prompt
        ).toBeVisible();

        const designPrompt =
            'Create a black oversized futuristic streetwear t-shirt with minimal white geometric graphics.';

        await prompt.fill(designPrompt);

        // Continue to review.
        await page.getByRole('button', {
            name: 'Review Design →',
        }).click();

        // --------------------------------------------------
        // Step 6: Review
        // --------------------------------------------------
        await expect(
            page.getByRole('heading', {
                name: 'Review Your Design',
            })
        ).toBeVisible();

        // Verify selected garment.
        await expect(
            page.getByText('T-Shirt', {
                exact: true,
            })
        ).toBeVisible();

        // Verify design prompt.
        await expect(
            page.getByText(designPrompt, {
                exact: true,
            })
        ).toBeVisible();

        // --------------------------------------------------
        // Step 7: Generate design
        // --------------------------------------------------
        await page.getByRole('button', {
            name: '✨ Generate Design',
        }).click();

        // --------------------------------------------------
        // Step 8: Verify generated design
        // --------------------------------------------------
        // The mocked API responds immediately, so we verify
        // the final generated state instead of the transient
        // "Creating your design" state.
        await expect(
            page.getByText('AI GENERATED CONCEPT')
        ).toBeVisible({
            timeout: 30000,
        });

        await expect(
            page.getByRole('heading', {
                name: 'Your Design',
            })
        ).toBeVisible();

        // Verify generated image.
        await expect(
            page.getByAltText('AI generated design')
        ).toBeVisible();

        // Verify Continue with Design button.
        await expect(
            page.getByRole('button', {
                name: 'Continue with Design →',
            })
        ).toBeVisible();
    });
});