import { test, expect, } from '@playwright/test';

test('login works', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	
	const titleLocator = page.locator("#title");
	await expect(titleLocator).toContainText('Welcome to StudySpot');
	
	// const usernameLocator = page.getByPlaceholder('Username');
	// const passwordLocator = page.getByPlaceholder('Password');
	
	const usernameLocator = page.locator('#loginName');
	const passwordLocator = page.locator('#loginPassword');
	
	await usernameLocator.fill('avas');
	await passwordLocator.fill('123456');
	
	// Assuming login works here, we will then test the app
	await page.locator("#loginButton").click();
	
	// Testing that we're now on the home page
	const homeUsernameLocator = page.locator("#userName");
	await expect(homeUsernameLocator).toContainText('Welcome Back, Ava');
	
	const logoutLocator = page.locator("#logoutButton");
	await expect(logoutLocator).toContainText("Log Out");
	
	// Check separate sorting options for click functionality
	await page.getByRole('button', { name: 'High' }).click();
	await page.getByRole('button', { name: 'Medium' }).click();
	await page.getByRole('button', { name: 'Low' }).click();
	await page.getByRole('button', { name: 'All levels' }).click();
	
	// Check individual buttons for click functionality
	await page.getByRole('button', { name: 'J John C. Hitt Library · Floor 1 North Reading Room Study Spot Quiet Favorited' }).click();
	await page.getByRole('button', { name: 'J John C. Hitt Library · Floor 2 West Commons Study Spot Moderate Not favorited' }).click();
	await page.getByRole('button', { name: 'J John C. Hitt Library · Floor 3 Digital Media Area Study Spot Busy Not' }).click();
	await page.getByRole('button', { name: 'J John C. Hitt Library · Floor 4 East Quiet Wing Study Spot Very quiet Favorited' }).click();
	await page.getByRole('button', { name: 'M Mathematical Sciences' }).click();
	await page.getByRole('button', { name: 'S Student Union · Level 1' }).click();
	
	await page.getByLabel('1st byRelevanceQuietest').selectOption('noise-asc');
	await page.getByLabel('1st byRelevanceQuietest').selectOption('noise-desc');

});

/*
test('buttons switch properly', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	
	// Testing if we can switch between login and register.
	const switchToRegister = page.getByText('Register');
	await expect.toHaveClass('tab-btn')
	await switchToRegister.click();
	await expect.toHaveClass('tab-btn active');
	
	const switchToLogin = page.getByText('Login');
	await expect.toHaveClass('tab-btn');
	await switchToLogin.click();
	await expect.toHaveClassI('tab-btn active');
});
*/