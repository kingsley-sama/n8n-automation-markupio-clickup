import { captureMarkupScreenshots } from './markupio_scrapper.js';

const result = await captureMarkupScreenshots(
  'https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7',
  2,
  { 
    outputDir: './screenshots',
    timeout: 60000,
    waitForFullscreen: true
  }
);