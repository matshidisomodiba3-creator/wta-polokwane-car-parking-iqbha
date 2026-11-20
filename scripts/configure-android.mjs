// Web to App Instant — applies the app icon, splash screen, permissions and
// native features to the generated Capacitor Android project.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const cfg = JSON.parse(fs.readFileSync('wta.json', 'utf8'));
const log = (m) => console.log(`[web-to-app] ${m}`);
const main = 'android/app/src/main';
const res = path.join(main, 'res');

// ── Permissions ──────────────────────────────────────────────────────────────
const manifestPath = path.join(main, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const perms = [...new Set(cfg.permissions || [])];
const lines = perms
  .filter((p) => !manifest.includes(`"${p.split('"')[0]}"`))
  .map((p) => `    <uses-permission android:name="${p}" />`)
  .join('\n');
if (lines) manifest = manifest.replace(/(\s*)<application/, `\n${lines}\n$1<application`);
if (perms.some((p) => p.includes('CAMERA'))) {
  manifest = manifest.replace(/(\s*)<application/, `\n    <uses-feature android:name="android.hardware.camera" android:required="false" />$1<application`);
}
if (cfg.source === 'url' && cfg.url.startsWith('http://') && !manifest.includes('usesCleartextTraffic')) {
  manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="true"');
}
fs.writeFileSync(manifestPath, manifest);
log(`Permissions: ${perms.length ? perms.map((p) => p.split('"')[0].split('.').pop()).join(', ') : 'internet only'}`);

// ── Icons & splash ───────────────────────────────────────────────────────────
const icon = sharp('assets-wta/icon.png').ensureAlpha();
const { data: px } = await sharp('assets-wta/icon.png').ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const bg = px[3] < 30 ? { r: 255, g: 255, b: 255 } : { r: px[0], g: px[1], b: px[2] };
const hex = '#' + [bg.r, bg.g, bg.b].map((v) => v.toString(16).padStart(2, '0')).join('');
const iconPng = await icon.png().toBuffer();

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, s] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * s);
  await sharp(iconPng).resize(legacy, legacy, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'));
  const circle = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="#fff"/></svg>`);
  await sharp(iconPng).resize(legacy, legacy, { fit: 'cover' }).composite([{ input: circle, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  const fg = Math.round(108 * s);
  const inner = Math.round(fg * 0.68);
  const innerPng = await sharp(iconPng).resize(inner, inner, { fit: 'cover' }).png().toBuffer();
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { ...bg, alpha: 1 } } })
    .composite([{ input: innerPng, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'));
}
const bgXml = path.join(res, 'values', 'ic_launcher_background.xml');
fs.mkdirSync(path.dirname(bgXml), { recursive: true });
fs.writeFileSync(bgXml, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${hex}</color>\n</resources>\n`);

let splashCount = 0;
for (const dir of fs.readdirSync(res)) {
  const f = path.join(res, dir, 'splash.png');
  if (!dir.startsWith('drawable') || !fs.existsSync(f)) continue;
  const meta = await sharp(f).metadata();
  const w = meta.width || 480, h = meta.height || 800;
  const size = Math.round(Math.min(w, h) * 0.32);
  const logo = await sharp(iconPng).resize(size, size, { fit: 'cover' }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { ...bg, alpha: 1 } } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(f + '.tmp.png');
  fs.renameSync(f + '.tmp.png', f);
  splashCount++;
}
log(`App icon applied (${Object.keys(densities).length} densities) · splash screens: ${splashCount} · theme ${hex}`);

// ── Native features (MainActivity + plugins) ─────────────────────────────────
function findMainActivity(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = findMainActivity(p);
      if (r) return r;
    } else if (e.name === 'MainActivity.java') return p;
  }
  return null;
}
const activity = findMainActivity(path.join(main, 'java'));
if (!activity) throw new Error('MainActivity.java not found');
const pkgDir = path.dirname(activity);
const fill = (t) => t.replaceAll('__PKG__', cfg.appId).replaceAll('__DOWNLOADS__', cfg.features.includes('downloads') ? 'true' : 'false').replaceAll('__BG__', hex);
fs.writeFileSync(activity, fill(fs.readFileSync('scripts/MainActivity.java', 'utf8')));
fs.writeFileSync(path.join(pkgDir, 'WTADownloaderPlugin.java'), fill(fs.readFileSync('scripts/WTADownloaderPlugin.java', 'utf8')));
fs.mkdirSync(path.join(main, 'assets'), { recursive: true });
fs.copyFileSync('scripts/wta-shim.js', path.join(main, 'assets', 'wta-shim.js'));
log(`Native features enabled: ${cfg.features.length ? cfg.features.join(', ') : 'none (standard app)'}`);
