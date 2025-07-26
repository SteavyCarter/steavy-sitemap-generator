// netlify/functions/generate-hourly-sitemap.js
// 🕒 Hourly Cron Wrapper for generate-daily-sitemap.js

const { spawn } = require('child_process');
const path = require('path');

exports.handler = async () => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../../generate-daily-sitemap.js');
    const child = spawn('node', [scriptPath]);

    let output = '';
    child.stdout.on('data', data => output += data.toString());
    child.stderr.on('data', data => output += data.toString());

    child.on('close', code => {
      console.log('⏱️ Cron script finished:\n', output);
      resolve({
        statusCode: 200,
        body: `Cron completed with code ${code}\n${output}`
      });
    });
  });
};
