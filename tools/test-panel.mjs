/**
 * The panel itself, in a real browser, against a fake portal.
 *
 * The library tests cannot see the bugs that live in panel.js: the duplicate
 * check that hung every download on its first document, the folder named after
 * a case number that happened to come first on the page. Both passed every
 * other check. This runs the real panel in headless Chrome with a scripted
 * portal and a fake chrome.storage, and drives it the way a lawyer would:
 * list, list again after a reload, download, print.
 *
 * The scenarios are tools/test-panel.html, tools/test-giris.html (the quick
 * login section and its e-Devlet half) and tools/test-popup.html (its setup); this
 * file serves the repository,
 * starts Chrome, and reads the verdicts back.
 *
 *   node tools/test-panel.mjs
 *
 * Needs Chrome or Chromium. Found automatically on the usual paths; otherwise
 * set CHROME_PATH. Without one the test is skipped, not failed.
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

const KOK = path.resolve(import.meta.dirname, '..');
const SURE = 10 * 60_000;

function chromeBul() {
  // A path that does not exist is no browser: say so, rather than crash on spawn.
  if (process.env.CHROME_PATH) return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  const adaylar =
    process.platform === 'win32'
      ? [
          `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
        : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
            .map((ad) => spawnSync('which', [ad], { encoding: 'utf8' }).stdout.trim())
            .filter(Boolean);
  return adaylar.find((a) => a && fs.existsSync(a)) || null;
}

const TURLER = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ttf': 'font/ttf'
};

/** The repository over HTTP: ES modules will not load from file:// URLs. */
function sunucuBaslat() {
  const sunucu = http.createServer((req, res) => {
    const yol = path.join(KOK, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!yol.startsWith(KOK) || !fs.existsSync(yol) || fs.statSync(yol).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TURLER[path.extname(yol)] || 'application/octet-stream' });
    fs.createReadStream(yol).pipe(res);
  });
  return new Promise((resolve) => sunucu.listen(0, '127.0.0.1', () => resolve(sunucu)));
}

function htmlCoz(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const chrome = chromeBul();
if (!chrome) {
  // Locally a missing browser is a reason to skip. In CI it is a reason to fail:
  // a runner image that stops shipping Chrome would otherwise turn this test
  // into a silent "skipped" and the build would stay green with nothing tested.
  const zorunlu = process.env.PANEL_TESTI_ZORUNLU === '1';
  console.log(`${zorunlu ? 'HATA  ' : 'atlandı'}  panel testi (Chrome bulunamadı — CHROME_PATH ile gösterilebilir)`);
  process.exit(zorunlu ? 1 : 0);
}

// Each scenario is a page of its own: the panel; the quick-login section with its
// e-Devlet half; the popup where the quick login is set up.
const SENARYOLAR = ['tools/test-panel.html', 'tools/test-giris.html', 'tools/test-popup.html', 'tools/test-durusma.html'];

async function senaryo(sayfa, port) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'uyap-arsiv-test-'));
  const bayraklar = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profil}`,
    '--dump-dom',
    // Virtual time: the queue's deliberate pauses between requests pass instantly.
    '--virtual-time-budget=600000',
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    `http://127.0.0.1:${port}/${sayfa}`
  ];

  const cikti = await new Promise((resolve) => {
    const islem = spawn(chrome, bayraklar, { stdio: ['ignore', 'pipe', 'ignore'] });
    let veri = '';
    const sayac = setTimeout(() => islem.kill(), SURE);
    islem.stdout.on('data', (d) => (veri += d));
    islem.on('close', () => {
      clearTimeout(sayac);
      resolve(veri);
    });
  });

  try {
    fs.rmSync(profil, { recursive: true, force: true });
  } catch {
    /* the browser may still hold a lock on its profile; the OS cleans temp */
  }

  const m = cikti.match(/<pre id="sonuc">([\s\S]*?)<\/pre>/);
  const satirlar = m ? htmlCoz(m[1]).split('\n') : [];
  console.log(`— ${sayfa}`);
  for (const s of satirlar) if (/^(ok|HATA|İSTİSNA|REJECT|HATA OLAYI|\s+at )/.test(s)) console.log(s);

  const bitti = satirlar.includes('BİTTİ');
  if (!bitti) console.log('HATA  senaryo sonuna ulaşmadı (sayfa yüklenemedi ya da süre doldu)');
  return satirlar.filter((s) => /^(HATA|İSTİSNA|REJECT)/.test(s)).length + (bitti ? 0 : 1);
}

const sunucu = await sunucuBaslat();
let sorunlu = 0;
for (const sayfa of SENARYOLAR) sorunlu += await senaryo(sayfa, sunucu.address().port);
sunucu.close();

console.log(sorunlu ? `\npanel testi: ${sorunlu} sorun bulundu.` : '\npanel testi: temiz');
process.exit(sorunlu ? 1 : 0);
