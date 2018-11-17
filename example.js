// If after 10 days of beginning of month, only check current month

// Modes: initial_crawl | current_month

/*

[
  {
    accountId: 'abc',
    startDate: '2018-03',
    transactionsHtml: '<table></table>'
  }, {
    accountId: 'abc',
    startDate: '2018-03',
    transactionsHtml: '<table></table>'
  }
]

*/

require('dotenv').load();
const puppeteer = require('puppeteer');

async function fetchTransactionTable(page, dateSliderHandle) {
  await dateSliderHandle;

  let urlRegex = /^https:\/\/www1.my.commbank.com.au\/netbank\/Transaction\/History.aspx/;

  await Promise.all([
    page.waitForResponse(response => response.url().match(urlRegex)),
    dateSliderHandle.click()
  ]);

  let transactionTableHandle = await page.$('#transactionsTableBody');
  if (transactionTableHandle == null) {
    return null;
  }

  let tableHtml = await page.$eval('#transactionsTableBody', table => table.innerHTML);
  return tableHtml;
}

async function fetchAccount(accountRowHandle) {
  let bsb = (await accountRowHandle.$eval('.BSBField', td => td.innerText)).replace(/\s/g, '');
  if (! bsb.match(/^\d{6}$/)) {
    return null;
  }

  let accountNumber = (await accountRowHandle.$eval('.AccountNumberField', td => td.innerText)).replace(/\s/g, '');
  let nickName = await accountRowHandle.$eval('.NicknameField a', a => a.innerText);
  let accountId = `${nickName}-${bsb}-${accountNumber}`;
  let htmlElementId = await accountRowHandle.$eval('td.NicknameField', td => td.getAttribute('id'));
  return { id: accountId, linkSelector: `#${htmlElementId} a` };
}

async function fetchTransactionPageAndReturn(account, page) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click(account.linkSelector)
  ]);

  let dateSliders = await page.$$('.dateslider_link');
  console.log(`Found ${dateSliders.length} dateSliders`);

  let moment = require('moment');
  let redis = require("redis");
  let client = redis.createClient();
  const {promisify} = require('util');
  const lpushAsync = promisify(client.lpush).bind(client);

  for (let i = 0; i < dateSliders.length; i++) {
    let dateSliderHandle = dateSliders[i];
    await dateSliderHandle;
    let startDate = await page.evaluate(el => el.getAttribute('data-startdate'), dateSliderHandle);
    let transactionTableHtml = await fetchTransactionTable(page, dateSliderHandle);

    let transactionPage = {
      accountId: account.id,
      startDate: moment(startDate, 'DD/MM/YYYY').format('YYYY-MM-DD'),
      transactionsHtml: transactionTableHtml
    };

    console.log(startDate);
    const response = await lpushAsync('transactions_page_queue', JSON.stringify(transactionPage));
    console.log(response);
  }

  await Promise.all([
    page.waitForNavigation(),
    page.click('#MainMenu a')
  ]);
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

  let accountRowHandles = await page.$$('.main_group_account_row');
  let accounts = [];
  for (let i = 0; i < accountRowHandles.length; i++) {
    let account = await fetchAccount(accountRowHandles[i]);
    if (account !== null) {
      accounts.push(account);
      console.log(`Found account ${account.id}  -  selector ${account.linkSelector}`);
    }
  }

  for (let i = 0; i < accounts.length; i++) {
    await fetchTransactionPageAndReturn(accounts[i], page);
  }

  await browser.close();
})();
