import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.TASKFLOWY_URL || 'http://127.0.0.1:4184';
const outDir = path.resolve('artifacts/screenshots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(outDir, 'desktop-home.png'), fullPage: true });
await page.getByRole('button', { name: /Search/ }).click();
await page.getByPlaceholder('Find any bullet…').fill('Today');
await page.screenshot({ path: path.join(outDir, 'desktop-search.png'), fullPage: true });
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /Help/ }).click();
await page.screenshot({ path: path.join(outDir, 'desktop-help.png'), fullPage: true });
await browser.close();
console.log(`Screenshots written to ${outDir}`);
