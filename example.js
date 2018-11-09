require('dotenv').load();
const puppeteer = require('puppeteer');

async function fetchTransactionTable(page, dateSliderHandle) {
  await dateSliderHandle;
  await dateSliderHandle.click();

  let urlRegex = /^https:\/\/www1.my.commbank.com.au\/netbank\/Transaction\/History.aspx/;
  await page.waitForResponse(response => urlRegex.test(response.url()) && response.status() === 200);

  let tableHtml = await page.$eval('#transactionsTableBody', table => table.innerHTML);
  return tableHtml;
}

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://www.netbank.com.au');

  await page.click('#txtMyClientNumber_field');
  await page.keyboard.type(process.env.CLIENT_NUMBER);

  await page.click('#txtMyPassword_field');
  await page.keyboard.type(process.env.PASSWORD);

  await page.click('#btnLogon_field');
  await page.waitForNavigation();

  let offsetHandle = await page.$('a[title=Offset]');
  await offsetHandle.click();
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  let dateSliders = await page.$$('.dateslider_link');
  console.log(dateSliders.length);

  for(let i = 0; i < dateSliders.length; i++) {
    let tableHtml = await fetchTransactionTable(page, dateSliders[i]);
  }

  await browser.close();
})();
