const { chromium } = require('playwright');
const fetch = require('node-fetch');

const URL = 'YOUR_APPSMITH_URL';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 }
  });

  await page.goto(URL);

  // TEMP: use delay (we’ll improve later)
  await page.waitForTimeout(30000);

  // Screenshot graph section (adjust selector later if needed)
  const graph = page.locator('text=Role Wise Distribution Table').locator('..');
  await graph.screenshot({ path: 'graph.png' });

  // Extract counts (simple version)
  const data = await page.evaluate(() => {
    const text = document.body.innerText;

    const getVal = (name) => {
      const regex = new RegExp(name + "\\s*(\\d+)");
      const match = text.match(regex);
      return match ? match[1] : '0';
    };

    return {
      Rahul: getVal('Rahul'),
      Supriya: getVal('Supriya'),
      Sree: getVal('Sree')
    };
  });

  await browser.close();

  const message = `
📊 *Daily POD Leaderboard*

Rahul: ${data.Rahul}
Supriya: ${data.Supriya}
Sree: ${data.Sree}
`;

  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-type': 'application/json' },
    body: JSON.stringify({ text: message })
  });

})();
