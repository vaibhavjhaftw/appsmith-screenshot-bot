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
  await page.waitForSelector('text=KAM Leaderboard', { timeout: 60000 });

  // Appsmith buffer
  await page.waitForTimeout(60000);

  // -------------------------------
  // 📸 SCREENSHOT
  // -------------------------------
  const graphPath = 'graph.png';

  const pageWidth = await page.evaluate(() => document.body.scrollWidth);

  await page.screenshot({
    path: graphPath,
    clip: {
      x: pageWidth * 0.48,
      y: 220,
      width: pageWidth * 0.42,
      height: 420
    }
  });

  console.log("✅ Graph captured");

  // -------------------------------
  // 📊 ROBUST DATA EXTRACTION
  // -------------------------------
  const data = await page.evaluate(() => {
    const text = document.body.innerText;

    const extract = (name) => {
      const match = text.match(new RegExp(`${name}\\s*-\\s*(\\d+)`));
      return match ? Number(match[1]) : 0;
    };

    return {
      Rahul: extract('Rahul'),
      Supriya: extract('Supriya'),
      Sree: extract('Sree')
    };
  });

  await browser.close();

  console.log("✅ Data:", data);

  // -------------------------------
  // 🧠 SORT PODS (IMPORTANT FIX)
  // -------------------------------
  const pods = Object.entries(data)
    .sort((a, b) => b[1] - a[1]);

  const total = pods.reduce((sum, [, val]) => sum + val, 0);

  // -------------------------------
  // ✍️ CLEAN ANNOUNCEMENT MESSAGE
  // -------------------------------
  const lines = pods
    .map(([name, val], i) => `${i + 1}. ${name} — ${val}`)
    .join('\n');

  const message = `
Daily POD Update (11:30 AM)

Total Shortlists: <${URL}|${total}>

${lines}
`.trim();

  // -------------------------------
  // 📤 SLACK UPLOAD
  // -------------------------------
  const fileBuffer = fs.readFileSync(graphPath);
  const fileSize = fileBuffer.length;

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
    console.log("❌ Upload URL error:", uploadData);
    return;
  }

  await fetch(uploadData.upload_url, {
    method: 'POST',
    body: fileBuffer
  });

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
    console.log("✅ Slack message sent");
  } else {
    console.log("❌ Slack error:", completeData);
  }

})();
