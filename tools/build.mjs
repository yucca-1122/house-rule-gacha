// app/gacha.html と games/<id>/rules.js から、次のものを作る（node だけで動く。依存なし）
//   games/<id>/index.html   … ブラウザで開く完成版（同じフォルダの rules.js を読む）。リポジトリに入れる
//   index.html              … ゲームの一覧（トップ）。リポジトリに入れる
//   dist/artifact/<id>.html … doctype なしの1枚（外側の骨組みを用意してくれる場所に貼る用）。dist/ は git に入れない
// どのページも相対パスだけで動く（リポジトリ名の下で配られても動く）
// 使い方: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, listGames, loadGame, rel } from './lib.mjs';

const TEMPLATE_FILE = path.join(ROOT, 'app', 'gacha.html');
const template = fs.readFileSync(TEMPLATE_FILE, 'utf8').replace(/\r\n/g, '\n');
const TAIL = '\n</body></html>\n';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// アイコン（assets/ にあるものだけ付ける）と、スマホのブラウザのバーの色（app/gacha.html の --sea。ライト・ダークの順）
const ICONS = [
  ['icon', '32x32', 'favicon-32.png'],
  ['icon', '192x192', 'icon-192.png'],
  ['apple-touch-icon', '180x180', 'apple-touch-icon.png']
];
const SEA = [...template.matchAll(/--sea:[ \t]*(#[0-9a-fA-F]{3,8})/g)].map((m) => m[1]);
function headExtras(prefix, shortTitle) {
  const tags = [];
  for (const [relName, sizes, file] of ICONS) {
    if (fs.existsSync(path.join(ROOT, 'assets', file))) tags.push(`<link rel="${relName}" type="image/png" sizes="${sizes}" href="${prefix}assets/${file}">`);
  }
  if (shortTitle) tags.push(`<meta name="apple-mobile-web-app-title" content="${esc(shortTitle)}">`);
  if (SEA[0]) tags.push(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${SEA[0]}">`);
  if (SEA[1]) tags.push(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${SEA[1]}">`);
  return tags.join('\n');
}
// games/<id>/index.html の頭（アイコンへのパスは2つ上の assets/）
const headFor = (shortTitle) => '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + headExtras('../../', shortTitle) + '\n</head><body>\n';
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

function withTitle(html, title) {
  if (!/<title>[\s\S]*?<\/title>/.test(html)) throw new Error('app/gacha.html に <title> が無い');
  return html.replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + esc(title) + '</title>');
}
// ゲームごとの色の差し替え（games/<id>/theme.css があれば、本体の <style> のすぐ後ろに足す）
function withTheme(html, dir, id) {
  const file = path.join(dir, 'theme.css');
  if (!fs.existsSync(file)) return html;
  const css = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/<\/style/gi, '<\\/style');
  const at = html.indexOf('</style>');
  if (at < 0) throw new Error('app/gacha.html に </style> が無い');
  const end = at + '</style>'.length;
  return html.slice(0, end) + '\n<style>\n/* theme: ' + id + ' */\n' + css.trim() + '\n</style>' + html.slice(end);
}

const problems = [];
const games = [];
const dirs = listGames();
if (!dirs.length) problems.push('games/<id>/rules.js が1つも無い');

fs.rmSync(path.join(ROOT, 'dist', 'artifact'), { recursive: true, force: true });
for (const dir of dirs) {
  let g;
  try { g = loadGame(dir); } catch (e) { problems.push(e.message); continue; }
  const meta = g.data.meta && typeof g.data.meta === 'object' ? g.data.meta : {};
  if (meta.id !== g.folder) { problems.push(`${rel(dir)}: meta.id（${meta.id}）をフォルダ名（${g.folder}）にそろえる`); continue; }
  if (!meta.title) { problems.push(`${rel(dir)}: meta.title が無い`); continue; }
  const rules = Array.isArray(g.data.rules) ? g.data.rules : [];
  const page = withTitle(withTheme(template, dir, g.folder), meta.title);
  write(path.join(dir, 'index.html'), headFor(meta.shortTitle || meta.title) + page + TAIL);
  // 埋め込み先のビューアに「左右の余白は max() で取ってある」と伝える設定。単体のページには要らないので、この1枚にだけ足す
  const embedPage = page.replace('</title>', '</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
  write(path.join(ROOT, 'dist', 'artifact', g.folder + '.html'), embedPage);
  const byLv = [1, 2, 3, 4, 5].map((lv) => rules.filter((r) => r.lv === lv).length);
  const tm = g.data.timer && typeof g.data.timer === 'object' && Array.isArray(g.data.timer.cards) && g.data.timer.cards.length ? g.data.timer : null;
  const roul = tm && tm.roulette && typeof tm.roulette === 'object' ? String(tm.roulette.title || '秒数ルーレット') : '';
  const timer = tm ? { title: tm.title || '持ち時間ガチャ', count: tm.cards.length, roulette: roul } : null;
  const tmd = g.data.team && typeof g.data.team === 'object' && Array.isArray(g.data.team.cards) && g.data.team.cards.length ? g.data.team : null;
  const team = tmd ? { title: tmd.title || 'チーム戦', count: tmd.cards.length } : null;
  games.push({ id: g.folder, title: meta.title, subtitle: meta.subtitle || '', updated: meta.updated || '', count: rules.length, byLv, team, timer, order: Number(meta.order) || 0 });
}
games.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

// ---------- 一覧（トップの index.html） ----------
const tokens = (() => {
  const a = template.indexOf('/* @tokens-start');
  const b = template.indexOf('/* @tokens-end */');
  if (a < 0 || b < 0) throw new Error('app/gacha.html に @tokens-start / @tokens-end の目印が無い');
  return template.slice(a, b).trim();
})();
const logo = (() => {
  const m = template.match(/<svg class="logo"[\s\S]*?<\/svg>/);
  if (!m) throw new Error('app/gacha.html にロゴの svg が無い');
  return m[0];
})();
const card = (g) => {
  const mix = g.byLv.map((n, i) => (n ? `<span class="m${i + 1}" style="flex-grow: ${n}"></span>` : '')).join('');
  const mixLabel = '難易度の内わけ: ' + g.byLv.map((n, i) => `★${i + 1} ${n}件`).join('、');
  return `      <li>
        <a class="game" href="games/${esc(g.id)}/">
          <h2 class="game-title">${esc(g.title)}</h2>
          ${g.subtitle ? `<p class="game-sub">${esc(g.subtitle)}</p>` : ''}
          <span class="mix" role="img" aria-label="${esc(mixLabel)}">${mix}</span>
          <span class="game-meta"><span><b>${g.count}</b>件</span>${g.updated ? `<span>更新 ${esc(g.updated)}</span>` : ''}</span>
          ${g.team ? `<span class="game-timer game-team"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="16.6" cy="9.2" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M2.8 19.5c.6-3.4 3-5.3 5.7-5.3s5.1 1.9 5.7 5.3M14.4 14.5c.7-.3 1.4-.4 2.2-.4 2.3 0 4.2 1.6 4.7 4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>${esc(g.team.title)} <b>${g.team.count}</b>種</span>` : ''}
          ${g.timer ? `<span class="game-timer"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7.8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 13.5V9.4M9.6 2.6h4.8M12 2.6v3.1M18.3 6.9l1.5-1.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>${esc(g.timer.title)} <b>${g.timer.count}</b>種${g.timer.roulette ? ' ＋ ' + esc(g.timer.roulette) : ''}</span>` : ''}
          <span class="game-go">開く</span>
        </a>
      </li>`;
};
const index = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ルールガチャ</title>
<meta name="description" content="ボードゲームの改造ルール（ハウスルール）をランダムに引くページ集。">
${headExtras('', 'ルールガチャ')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<!-- このファイルは tools/build.mjs が作る。直接は書きかえない -->
<style>
${tokens}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body {
  margin: 0;
  position: relative;
  z-index: 0;
  background: var(--sea);
  color: var(--on-sea);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: var(--sea-line);
  -webkit-mask-image: var(--hex-mask);
  mask-image: var(--hex-mask);
  -webkit-mask-size: 78px 135px;
  mask-size: 78px 135px;
}
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.page {
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 16px 64px;
}
.wrap { max-width: 1040px; margin-inline: auto; }
.masthead { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.logo { width: 46px; height: 44px; flex: none; }
.t-forest { fill: var(--forest); }
.t-brick { fill: var(--brick); }
.t-pasture { fill: var(--pasture); }
.t-wheat { fill: var(--wheat); }
.t-ore { fill: var(--ore); }
.t-sand { fill: var(--sand); }
.masthead-text { min-width: 0; }
.app-title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: clamp(22px, 6vw, 30px); line-height: 1.2; letter-spacing: .02em; text-wrap: balance; }
.app-sub { margin: 3px 0 0; font-size: 13px; line-height: 1.5; color: var(--on-sea-dim); }
.games { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); }
.game {
  height: 100%;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 18px 18px 16px;
  border-radius: 14px;
  background: var(--paper);
  color: var(--ink);
  text-decoration: none;
  box-shadow: 0 3px 0 var(--edge);
  overflow-wrap: anywhere;
}
.game-title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 21px; line-height: 1.35; text-wrap: balance; }
.game-sub { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink-dim); }
.mix { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--paper-2); }
.mix span { display: block; height: 100%; flex-basis: 0; }
.mix .m1 { background: var(--lv1); }
.mix .m2 { background: var(--lv2); }
.mix .m3 { background: var(--lv3); }
.mix .m4 { background: var(--lv4); }
.mix .m5 { background: linear-gradient(90deg, var(--lv5), var(--lv5-b)); }
.game-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 14px; font-size: 13px; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.game-meta b { font-family: var(--font-display); font-weight: 400; font-size: 17px; color: var(--ink); margin-right: 2px; }
.game-timer { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; font-size: 13px; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.game-timer svg { width: 15px; height: 15px; flex: none; align-self: center; color: var(--ink-dim); }
.game-timer b { font-family: var(--font-display); font-weight: 400; font-size: 15px; color: var(--ink); }
.game-go { justify-self: start; margin-top: 4px; padding: 8px 18px; border-radius: 10px; background: var(--wheat); color: var(--on-wheat); font-weight: 700; font-size: 14px; line-height: 1.2; box-shadow: 0 3px 0 var(--wheat-edge); }
.game:hover .game-go { filter: brightness(1.05); }
.foot { margin: 30px 0 0; font-size: 13px; line-height: 1.7; color: var(--on-sea-dim); }
</style>
</head>
<body>
<div class="page">
  <div class="wrap">
    <header class="masthead">
      ${logo.replace(/\n\s*/g, '\n        ')}
      <div class="masthead-text">
        <h1 class="app-title">ルールガチャ</h1>
        <p class="app-sub">ボードゲームの改造ルールを、難易度を選んでランダムに引くページ集</p>
      </div>
    </header>
    <main>
      <ul class="games">
${games.map(card).join('\n')}
      </ul>
    </main>
    <p class="foot">ファンが作ったハウスルール集です。どのゲームも、公式のものではありません。</p>
  </div>
</div>
</body>
</html>
`;

if (problems.length) {
  console.log('作れなかった:\n- ' + problems.join('\n- '));
  process.exit(1);
}
write(path.join(ROOT, 'index.html'), index);
console.log('作った:');
for (const g of games) {
  console.log(`- games/${g.id}/index.html（${g.title}・${g.count}件）`);
  console.log(`- dist/artifact/${g.id}.html（rules.js は games/${g.id}/rules.js を同じ場所に rules.js という名前で置く）`);
}
console.log(`- index.html（一覧・${games.length}ゲーム）`);
