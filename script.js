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

  // 🔴 Appsmith buffer (KEEP THIS)
  await page.waitForTimeout(60000);

  const graphPath = 'graph.png';

  let cropped = false;

  try {
    // ✅ Wait for canvas (NOT forcing visible)
    await page.waitForSelector('canvas', { state: 'attached', timeout: 40000 });

    const canvases = page.locator('canvas');
    const count = await canvases.count();

    if (count === 0) throw new Error("No canvas found");

    const canvas = canvases.last();

    // Scroll into view (important)
    await canvas.scrollIntoViewIfNeeded();

    // Wait small render buffer
    await page.waitForTimeout(3000);

    // Parent container
    const container = canvas.locator('xpath=ancestor::div[1]');
    const box = await container.boundingBox();

    if (!box) throw new Error("Bounding box failed");

    await page.screenshot({
  path: graphPath,
  clip: {
    x: box.x + 40,        // 👉 move right → removes left table
    y: Math.max(box.y - 20, 0),
    width: box.width - 80, // 👉 trims both sides slightly
    height: box.height + 120 // 👉 extend bottom properly
  }
});

    console.log("✅ Chart cropped via canvas");
    cropped = true;

  } catch (err) {
    console.log("⚠️ Canvas method failed → fallback crop");

    // ✅ Fallback (your earlier approach but improved)
    const pageWidth = await page.evaluate(() => document.body.scrollWidth);

    await page.screenshot({
      path: graphPath,
      clip: {
        x: pageWidth * 0.42,
        y: 180,
        width: pageWidth * 0.48,
        height: 420
      }
    });
  }

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
  // ✅ MESSAGE
  // -------------------------------
  const total =
    Number(data.Rahul) +
    Number(data.Supriya) +
    Number(data.Sree);

  const message = `
Hey! 🚀

We’re at *<${URL}|${total} Profile Shortlists>* today.

🥇 Rahul — ${data.Rahul}
🥈 Supriya — ${data.Supriya}
🥉 Sree — ${data.Sree}
`;

  // -------------------------------
  // ✅ SLACK UPLOAD
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
