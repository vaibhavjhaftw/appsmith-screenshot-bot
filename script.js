const { chromium } = require('playwright');
const fetch = require('node-fetch');
const fs = require('fs');

const URL = 'https://app.appsmith.com/app/interview-leaderboard-all-graph/page1-69da1360e25e19606fe1f924';

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CHANNEL = 'C025HDZGHLL'; // KAM New - C025HDZGHLL || Test Channel - C09PVQ14RP0

(async () => {

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 2000 }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.waitForSelector('text=Role Wise Distribution Table For (Select KAMs)', { timeout: 60000 });

  await page.waitForTimeout(40000);

  await page.screenshot({
    path: 'full.png',
    fullPage: true
  });

  const pageWidth = await page.evaluate(() => document.body.scrollWidth);

  const graphPath = 'graph.png';

  await page.screenshot({
    path: graphPath,
    clip: {
      x: pageWidth * 0.45,
      y: 140,
      width: pageWidth * 0.5,
      height: 500
    }
  });

  console.log("✅ Chart cropped");

  const data = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/Rahul\s*-\s*(\d+).*?Supriya\s*-\s*(\d+).*?Sree\s*-\s*(\d+)/s);

    if (match) {
      return {
        Rahul: match[1],
        Supriya: match[2],
        Sree: match[3]
      };
    }

    return { Rahul: '0', Supriya: '0', Sree: '0' };
  });

  await browser.close();

  console.log("✅ Extracted Data:", data);

const APP_LINK = 'https://app.appsmith.com/app/interview-leaderboard-all-graph/page1-69da1360e25e19606fe1f924';

// calculate total dynamically (better than hardcoding 57)
const total = Number(data.Rahul) + Number(data.Supriya) + Number(data.Sree);

const message = `
Hey <!subteam^S06NQ302DDX>,

We’re at *<${APP_LINK}|${total} Profile Shortlists>* today.

🥇 Rahul - ${data.Rahul}
🥈 Supriya - ${data.Supriya}
🥉 Sree - ${data.Sree}
`;

  // -------------------------------
  // ✅ SLACK UPLOAD (FIXED)
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
    console.log("❌ Slack upload URL error:", uploadData);
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
    console.log("✅ Sent to Slack successfully");
  } else {
    console.log("❌ Slack complete upload error:", completeData);
  }

})();
