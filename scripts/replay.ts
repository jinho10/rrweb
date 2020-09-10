/* tslint:disable: no-console */

import * as fs from 'fs';
import * as path from 'path';
import * as EventEmitter from 'events';
import * as inquirer from 'inquirer';
import * as puppeteer from 'puppeteer';
import { eventWithTime } from '../src/types';

const emitter = new EventEmitter();

function getCode(): string {
  const bundlePath = path.resolve(__dirname, '../dist/rrweb.min.js');
  return fs.readFileSync(bundlePath, 'utf8');
}

(async () => {
  const code = getCode();
  let events: eventWithTime[] = [];

  start();

  async function start() {
    events = [];
    const { name } = await inquirer.prompt<{ name: string }>([
      {
        type: 'input',
        name: 'name',
        message:
          'Enter the name you used to record. e.g. train-ticket : ',
      },
    ]);

    console.log(`Going to replay ${name}...`);
    await replay(name);

    const { shouldReplayAnother } = await inquirer.prompt<{
      shouldReplayAnother: boolean;
    }>([
      {
        type: 'confirm',
        name: 'shouldReplayAnother',
        message: 'Replay one more time?',
      },
    ]);

    if (shouldReplayAnother) {
      start();
    } else {
      process.exit();
    }

    process.exit();
  }

  async function replay(name: string) {
    const tempFolder = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempFolder)) {
      console.log("temp Folder does not exist");
      process.exit();
    }

    let fileName = `${name}.json`;
    let savePath = path.resolve(tempFolder, fileName);
    let events = fs.readFileSync(savePath);

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--start-fullscreen', '--start-maximized'],
    });
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.addStyleTag({
      path: path.resolve(__dirname, '../dist/rrweb.min.css'),
    });

  // ${JSON.stringify(events)};
    await page.evaluate(`${code}
      const events = ${events}; 
      const replayer = new rrweb.Replayer(events);
      replayer.play();
    `);
  }

  process
    .on('uncaughtException', (error) => {
      console.error(error);
    })
    .on('unhandledRejection', (error) => {
      console.error(error);
    });
})();
