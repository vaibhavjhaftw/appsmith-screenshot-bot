const { chromium } = require('playwright');
const fetch = require('node-fetch');
const fs = require('fs');

const URL = 'https://app.appsmith.com/app/interview-leaderboard-all-graph/page1-69da1360e25e19606fe1f924';

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CHANNEL = 'C09PVQ14RP0';

(async () => {

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 2000 }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });

  // Wait for section to appear
  await page.waitForSelector('text=KAM Leaderboard', { timeout: 60000 });

  // 🔴 CRITICAL: Appsmith load buffer
  await page.waitForTimeout(60000);

  // -------------------------------
// ✅ TRUE CHART DETECTION (NO GUESSWORK)
// -------------------------------
const graphPath = 'graph.png';

// Wait for chart to render
await page.waitForSelector('canvas', { timeout: 60000 });

// Get the chart canvas
const canvas = page.locator('canvas').last();

// Get its parent container (important)
const container = canvas.locator('xpath=ancestor::div[1]');

// Get bounding box of container
const box = await container.boundingBox();

if (!box) {
  throw new Error("Chart container not found");
}

// Slight padding tuning (this is minimal + stable)
await page.screenshot({
  path: graphPath,
  clip: {
    x: box.x - 20,
    y: box.y - 40,
    width: box.width + 40,
    height: box.height + 60
  }
});

console.log("✅ Chart cropped perfectly");

  
  // -------------------------------
  // ✅ RELIABLE DATA EXTRACTION
  // -------------------------------
  const data = await page.evaluate(() => {
    const text = document.body.innerText;

    const summaryLine = text.split('\n').find(line =>
      line.includes('Rahul') &&
      line.includes('Supriya') &&
      line.includes('Sree')
    );

    if (!summaryLine) {
      return { Rahul: '0', Supriya: '0', Sree: '0' };
    }

    const extract = (name) => {
      const match = summaryLine.match(new RegExp(`${name}\\s*-\\s*(\\d+)`));
      return match ? match[1] : '0';
    };

    return {
      Rahul: extract('Rahul'),
      Supriya: extract('Supriya'),
      Sree: extract('Sree')
    };
  });

  await browser.close();

  console.log("✅ Extracted Data:", data);

  // -------------------------------
  // ✅ MESSAGE FORMATTING  KAMs = <!subteam^S06NQ302DDX>
  // -------------------------------
  const APP_LINK = URL;

  const total =
    Number(data.Rahul) +
    Number(data.Supriya) +
    Number(data.Sree);

  const message = `
Hey! 🚀

We’re at *<${APP_LINK}|${total} Profile Shortlists>* today.

🥇 Rahul — ${data.Rahul}
🥈 Supriya — ${data.Supriya}
🥉 Sree — ${data.Sree}
`;

  // -------------------------------
  // ✅ SLACK FILE UPLOAD (LATEST API)
  // -------------------------------
  const fileBuffer = fs.readFileSync(graphPath);
  const fileSize = fileBuffer.length;

  // STEP 1: Get upload URL
  const uploadParams = new URLSearchParams();
  uploadParams.append('filename', 'graph.png');
  uploadParams.append('length', fileSize.toString());

  const uploadRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: uploadParams
  });

  const uploadData = await uploadRes.json();

  if (!uploadData.ok) {
    console.log("❌ Slack upload URL error:", uploadData);
    return;
  }

  // STEP 2: Upload file
  await fetch(uploadData.upload_url, {
    method: 'POST',
    body: fileBuffer
  });

  // STEP 3: Complete upload
  const completeParams = new URLSearchParams();
  completeParams.append('files', JSON.stringify([
    {
      id: uploadData.file_id,
      title: 'Daily POD Graph'
    }
  ]));
  completeParams.append('channel_id', CHANNEL);
  completeParams.append('initial_comment', message);

  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: completeParams
  });

  const completeData = await completeRes.json();

  if (completeData.ok) {
    console.log("✅ Sent to Slack successfully");
  } else {
    console.log("❌ Slack complete upload error:", completeData);
  }

})();
