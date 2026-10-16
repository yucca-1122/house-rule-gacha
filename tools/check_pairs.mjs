// 両立判定の回帰チェック: <ゲームのフォルダ>/pairs.json の組を、ルールのタイトルで確かめる
// 使い方: node tools/check_pairs.mjs games/catan   （引数なしなら games/ の全部）
// pairs.json: { "mustBlock": [["タイトルA", "タイトルB"], …], "mustAllow": [[…], …] }
import fs from 'node:fs';
import path from 'node:path';
import { gameDirsFromArgs, loadGame, conflicts, rel } from './lib.mjs';

const dirs = gameDirsFromArgs(process.argv.slice(2));
if (!dirs.length) { console.log('検査するゲームが無い（games/<id>/rules.js）'); process.exit(1); }
let failed = 0;

for (const dir of dirs) {
  console.log(`== ${rel(dir)} ==`);
  const file = path.join(dir, 'pairs.json');
  if (!fs.existsSync(file)) { console.log('未実施: pairs.json が無い（組の検査はしていない）'); continue; }
  let pairs;
  let R;
  try {
    pairs = JSON.parse(fs.readFileSync(file, 'utf8'));
    R = loadGame(dir).data.rules || [];
  } catch (e) { console.log('NG 読めない: ' + e.message); failed++; continue; }
  const mustBlock = Array.isArray(pairs.mustBlock) ? pairs.mustBlock : [];
  const mustAllow = Array.isArray(pairs.mustAllow) ? pairs.mustAllow : [];
  let bad = 0;
  const by = (t) => { const r = R.find((x) => x.title === t); if (!r) { bad++; console.log('タイトルが見つからない:', t); } return r; };
  for (const [a, b] of mustBlock) { const ra = by(a), rb = by(b); if (ra && rb && !conflicts(ra, rb)) { bad++; console.log('止まっていない:', a, '×', b); } }
  for (const [a, b] of mustAllow) { const ra = by(a), rb = by(b); if (ra && rb && conflicts(ra, rb)) { bad++; console.log('止めすぎ:', a, '×', b); } }
  console.log(bad ? `NG ${bad}件` : `OK（止めるべき${mustBlock.length}組・組めるべき${mustAllow.length}組）`);
  if (bad) failed++;
}
process.exit(failed ? 1 : 0);
