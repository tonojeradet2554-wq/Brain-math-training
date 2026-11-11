// Copies the single-file build to ./index.html (the file Vercel serves).
import fs from 'node:fs';

const from = new URL('../client/dist-single/index.html', import.meta.url);
const to = new URL('../index.html', import.meta.url);
fs.copyFileSync(from, to);
console.log(`index.html written (${(fs.statSync(to).size / 1024).toFixed(0)} KB)`);
