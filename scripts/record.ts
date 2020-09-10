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
          'Enter the name you want to record, e.g train-ticket : ',
      },
    ]);

    const { url } = await inquirer.prompt<{ url: string }>([
      {
        type: 'input',
        name: 'url',
        message:
          'Enter the url you want to record, e.g https://google.com : ',
      },
    ]);

    console.log(`Going to open ${url}...`);
    await record(url);
    console.log('Ready to record. You can do any interaction on the page.');

    const { shouldStore } = await inquirer.prompt<{ shouldStore: boolean }>([
      {
        type: 'confirm',
        name: 'shouldStore',
        message: `Persistently store these recorded events?`,
      },
    ]);

    if (shouldStore) {
      saveEvents(url, name);
    }

    const { shouldRecordAnother } = await inquirer.prompt<{
      shouldRecordAnother: boolean;
    }>([
      {
        type: 'confirm',
        name: 'shouldRecordAnother',
        message: 'Record another one?',
      },
    ]);

    if (shouldRecordAnother) {
      start();
    } else {
      process.exit();
    }
  }

  async function record(url: string) {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--start-fullscreen', '--start-maximized', '--ignore-certificate-errors'] // 
    });
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: 'domcontentloaded'
    });

    await page.exposeFunction('_replLog', (event: eventWithTime) => {
      events.push(event);
    });
    await page.evaluate(`;${code}
      window.__IS_RECORDING__ = true
      rrweb.record({
        emit: event => window._replLog(event),
        recordCanvas: true
      });
    `);
    page.on('framenavigated', async () => {
      const isRecording = await page.evaluate('window.__IS_RECORDING__');
      if (!isRecording) {
        await page.evaluate(`;${code}
          window.__IS_RECORDING__ = true
          rrweb.record({
            emit: event => window._replLog(event),
            recordCanvas: true
          });
        `);
      }
    });

    emitter.once('done', async (shouldReplay) => {
      await browser.close();
      if (shouldReplay) {
        await replay();
      }
    });
  }

  async function replay() {
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--start-fullscreen', '--start-maximized'],
    });
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.addStyleTag({
      path: path.resolve(__dirname, '../dist/rrweb.min.css'),
    });
    await page.evaluate(`${code}
      const events = ${JSON.stringify(events)};
      const replayer = new rrweb.Replayer(events);
      replayer.play();
    `);
  }

  // TODO: base url should be changed to COMMONNAME like URL
  function saveEvents(url: string, name: string) {
    const tempFolder = path.join(__dirname, '../temp');
    console.log(tempFolder);

    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder);
    }
    /*
    const time = new Date()
      .toISOString()
      .replace(/[-|:]/g, '_')
      .replace(/\..+/, '');
    */

    let fileName = `${name}.html`;
    let content = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <title>Record @${name}</title>
    <link rel="stylesheet" href="../dist/rrweb.min.css" />
  </head>
  <body>
    <script src="../dist/rrweb.min.js"></script>
    <script>
      /*<!--*/
      const events = ${JSON.stringify(events).replace(
        /<\/script>/g,
        '<\\/script>',
      )};
      /*-->*/
      const replayer = new rrweb.Replayer(events, {
        UNSAFE_replayCanvas: true
      });
      replayer.play();
    </script>
  </body>
</html>  
    `;
    let savePath = path.resolve(tempFolder, fileName);
    fs.writeFileSync(savePath, content);

    console.log(`Saved at ${savePath}`);

    fileName = `${name}.json`;
    content = `${JSON.stringify(events)}`;
    savePath = path.resolve(tempFolder, fileName);
    fs.writeFileSync(savePath, content);

    console.log(`Saved at ${savePath}`);
  }

  process
    .on('uncaughtException', (error) => {
      console.error(error);
    })
    .on('unhandledRejection', (error) => {
      console.error(error);
    });
})();
