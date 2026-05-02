import { test, expect } from '@playwright/test';

test.describe('NutriGuard Medication Reminders', () => {
  test('should show medication reminders and enable notifications', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Wait for the app to load
    await page.waitForSelector('text=Stats', { timeout: 10000 });

    // The medication reminders are in the dashboard (Stats tab), which should be the default

    // Check if notification permission button is visible
    const notificationButton = page.locator('button:has-text("Enable Notifications")');
    const isVisible = await notificationButton.isVisible();

    if (isVisible) {
      // Click to enable notifications
      await notificationButton.click();

      // Handle the permission dialog if it appears
      page.on('dialog', async dialog => {
        await dialog.accept();
      });
    }

    // Add a test medication - click the plus button next to Medication Reminders
    const addButtons = page.locator('button').filter({ hasText: '+' });
    await addButtons.nth(1).click(); // Second plus button should be for medications

    // Fill in medication details
    await page.fill('input[placeholder="Medication name"]', 'Test Medicine');
    await page.fill('input[placeholder="Dosage (e.g., 500mg)"]', '500mg');
    await page.fill('input[type="time"]', '08:00');

    // Submit the form
    await page.click('button:has-text("Add Medication")');

    // Wait for the medication to appear
    await page.waitForSelector('text=Test Medicine');

    // Check if the medication is displayed with correct styling
    const medicationItem = page.locator('text=Test Medicine').locator('..').locator('..');
    await expect(medicationItem).toBeVisible();

    console.log('✅ Medication reminder test passed');
  });

  test('should generate PDF report', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for the app to load
    await page.waitForSelector('text=Stats', { timeout: 10000 });

    // Set up a basic profile first - click Profile tab
    await page.click('text=Profile');
    await page.fill('input[placeholder="Your name"]', 'Test User');
    await page.fill('input[placeholder="Age"]', '30');
    await page.fill('input[placeholder="Weight (kg)"]', '70');
    await page.fill('input[placeholder="Height (cm)"]', '170');
    await page.fill('textarea[placeholder="Medical conditions"]', 'None');
    await page.fill('textarea[placeholder="Fitness goals"]', 'Stay healthy');
    await page.click('button:has-text("Save Profile")');

    // Go back to Stats tab
    await page.click('text=Stats');

    // Click generate PDF button
    const pdfButton = page.locator('button:has-text("Export PDF Report")');
    await pdfButton.click();

    // Wait for success message
    await page.waitForSelector('text=Health report generated successfully');

    console.log('✅ PDF generation test passed');
  });

  test('should analyze meal with AI', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for the app to load
    await page.waitForSelector('text=Stats', { timeout: 10000 });

    // Click on the log tab (the plus button in the center)
    const logButton = page.locator('button').filter({ has: page.locator('[class*="scale-110"]') });
    await logButton.click();

    // Enter meal description
    await page.fill('textarea[placeholder="Describe your meal..."]', 'I ate a chicken sandwich with lettuce and tomato');

    // Click analyze button
    await page.click('button:has-text("Analyze Meal")');

    // Wait for analysis to complete
    await page.waitForSelector('text=Analysis complete', { timeout: 30000 });

    // Check if nutritional breakdown is shown
    await expect(page.locator('text=Calories:')).toBeVisible();

    console.log('✅ AI meal analysis test passed');
  });
});