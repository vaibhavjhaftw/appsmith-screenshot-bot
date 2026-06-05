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
      x: pageWidth * 0.50,
      y: 180,
      width: pageWidth * 0.38,
      height: 450
    }
  });

  console.log("✅ Graph captured");

  // -------------------------------
  // 📊 ROBUST DATA EXTRACTION (All PODs from table)
  // -------------------------------
  const data = await page.evaluate(() => {
    const results = {};
    const text = document.body.innerText;

    // Known KAM names to look for in the page text
    const kamNames = ['Supriya', 'Kritika', 'Priya', 'Pranav', 'Aditi', 'Raghav', 'Tanvi', 'Rahul', 'Sujith', 'Vinit', 'Sree'];

    // Parse table-like structure from innerText
    // The table rows appear as: "1\tSupriya\t51\t7\t28\t25.00%"
    const lines = text.split('\n');
    for (const line of lines) {
      // Match lines that look like table rows: number, name, shortlists...
      const parts = line.split(/\t+/);
      if (parts.length >= 3) {
        const rank = parseInt(parts[0], 10);
        const name = parts[1]?.trim();
        const shortlists = parseInt(parts[2], 10);
        if (rank >= 1 && rank <= 20 && name && kamNames.includes(name) && !isNaN(shortlists)) {
          results[name] = shortlists;
        }
      }
    }

    // Fallback: extract from graph labels like "Kritika (51)" or "Tanvi (20)"
    const graphMatches = text.matchAll(/([A-Za-z]+)\s*\((\d+)\)/g);
    for (const match of graphMatches) {
      const name = match[1];
      const value = parseInt(match[2], 10);
      if (kamNames.includes(name) && !results[name] && value > 0) {
        results[name] = value;
      }
    }

    // Also try header pattern "Raghav - 97" as final fallback
    const headerMatches = text.matchAll(/([A-Za-z]+)\s*-\s*(\d+)/g);
    for (const match of headerMatches) {
      const name = match[1];
      const value = parseInt(match[2], 10);
      if (kamNames.includes(name) && !results[name] && value > 0) {
        results[name] = value;
      }
    }

    return results;
  });

  await browser.close();

  console.log("✅ Data:", data);

  // -------------------------------
// 🧠 SORT + FORMAT (All PODs)
// -------------------------------
const pods = Object.entries(data)
  .sort((a, b) => b[1] - a[1]);

const total = pods.reduce((sum, [, val]) => sum + Number(val), 0);

// medal emojis for top 3
const medals = [
  ':first_place_medal:',
  ':second_place_medal:',
  ':third_place_medal:'
];

const rankedLines = pods
  .map(([name, val], i) => {
    if (i < 3) {
      return `${medals[i]} *${name}* — ${val}`;
    }
    return `    ${i + 1}. ${name} — ${val}`;
  })
  .join('\n');

// -------------------------------
// ✍️ FINAL MESSAGE
// -------------------------------
const message = `
Hey!

We’re at *<${URL}|${total} Profile Shortlists>* today.

${rankedLines}
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
