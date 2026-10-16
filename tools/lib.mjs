// tools の共通部品: ゲームの一覧・rules.js の読み込み・両立判定
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// リポジトリのいちばん上（tools/ の1つ上）
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAMES = path.join(ROOT, 'games');

// games/ の下で rules.js を持つフォルダ（名前順）
export function listGames() {
  if (!fs.existsSync(GAMES)) return [];
  return fs.readdirSync(GAMES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(GAMES, d.name, 'rules.js')))
    .map((d) => path.join(GAMES, d.name))
    .sort();
}

// 引数があればそのフォルダ、無ければ games/ の全部
export function gameDirsFromArgs(args) {
  return args.length ? args.map((a) => path.resolve(a)) : listGames();
}

// rules.js をブラウザと同じように読む（window.RULE_GACHA。古い名前 window.CATAN_RULES も読む）
export function loadGame(dir) {
  const file = path.join(dir, 'rules.js');
  const src = fs.readFileSync(file, 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: file });
  const data = ctx.window.RULE_GACHA || ctx.window.CATAN_RULES;
  if (!data || typeof data !== 'object') throw new Error(path.relative(ROOT, file) + ' に window.RULE_GACHA が無い');
  return { dir, folder: path.basename(dir), file, data };
}

// 表示用の短い場所（リポジトリからの相対）
export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/') || '.';

// 両立しない：x が1つでも重なる、または一方の ban と他方の req が重なる（画面 app/gacha.html の clash と同じ規則）
export function conflicts(a, b) {
  const ax = a.x || [], bx = b.x || [];
  if (ax.some((k) => bx.includes(k))) return true;
  const ab = a.ban || [], bb = b.ban || [], ar = a.req || [], br = b.req || [];
  return ab.some((k) => br.includes(k)) || bb.some((k) => ar.includes(k));
}
