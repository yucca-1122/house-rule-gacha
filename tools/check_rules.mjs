// rules.js の検査: meta・id の通し番号・必須項目・語彙（features）・件数・両立判定・持ち時間（timer）・言葉（glossary）・チーム戦（team）
// 使い方: node tools/check_rules.mjs games/catan   （引数なしなら games/ の全部）
import { gameDirsFromArgs, loadGame, conflicts, rel } from './lib.mjs';

const dirs = gameDirsFromArgs(process.argv.slice(2));
if (!dirs.length) { console.log('検査するゲームが無い（games/<id>/rules.js）'); process.exit(1); }
let failedGames = 0;

for (const dir of dirs) {
  console.log(`== ${rel(dir)} ==`);
  let game;
  try { game = loadGame(dir); } catch (e) { console.log('問題:\n- 読めない: ' + e.message); failedGames++; continue; }
  const D = game.data;
  const problems = [];
  const meta = D.meta && typeof D.meta === 'object' ? D.meta : {};
  const R = Array.isArray(D.rules) ? D.rules : [];
  if (!R.length) problems.push('rules が無い・0件');

  // meta
  if (meta.id !== game.folder) problems.push(`meta.id（${meta.id}）がフォルダ名（${game.folder}）と違う`);
  if (!meta.title) problems.push('meta.title が無い');
  const pl = meta.players;
  const choices = Array.isArray(pl) ? pl : (pl && Array.isArray(pl.choices) ? pl.choices : []);
  if (choices.some((n) => !Number.isInteger(n) || n < 1)) problems.push('meta.players の選択肢が整数でない');
  if (pl && !Array.isArray(pl) && pl.default !== undefined && !choices.includes(pl.default)) problems.push('meta.players.default が選択肢に無い');
  const draw = meta.draw;
  if (draw && Array.isArray(draw.choices) && draw.default !== undefined && !draw.choices.includes(draw.default)) problems.push('meta.draw.default が選択肢に無い');

  // id
  R.forEach((r, i) => { if (r.id !== i + 1) problems.push(`id の並び: index ${i} が id ${r.id}`); });
  // 必須項目
  const catKeys = new Set((D.cats || []).map((c) => c.key));
  const known = new Set(['id', 'lv', 'cat', 'title', 'text', 'list', 'note', 'need', 'p', 'x', 'req', 'ban']);
  for (const r of R) {
    for (const k of ['id', 'lv', 'cat', 'title', 'text']) if (r[k] === undefined || r[k] === '') problems.push(`No.${r.id} ${k} が無い`);
    if (!catKeys.has(r.cat)) problems.push(`No.${r.id} 不明な cat: ${r.cat}`);
    if (![1, 2, 3, 4, 5].includes(r.lv)) problems.push(`No.${r.id} lv が変: ${r.lv}`);
    if (r.p !== undefined && !choices.includes(r.p)) problems.push(`No.${r.id} p が人数の選択肢に無い: ${r.p}`);
    for (const k of ['x', 'req', 'ban', 'list']) if (r[k] !== undefined && !Array.isArray(r[k])) problems.push(`No.${r.id} ${k} が配列でない`);
    for (const k of Object.keys(r)) if (!known.has(k)) problems.push(`No.${r.id} 知らない項目: ${k}`);
  }
  // lv の並び（★1→★5 の順に並んでいるか）
  for (let i = 1; i < R.length; i++) if (R[i].lv < R[i - 1].lv) problems.push(`lv の並びが逆: No.${R[i].id}`);
  // タイトル重複
  const seen = new Map();
  for (const r of R) { if (seen.has(r.title)) problems.push(`タイトル重複: ${r.title}（No.${seen.get(r.title)} と No.${r.id}）`); seen.set(r.title, r.id); }
  // 語彙（req / ban は features のキーだけ）
  const FEATURES = new Set(D.features && typeof D.features === 'object' ? Object.keys(D.features) : []);
  const used = new Set();
  const xCount = new Map();
  for (const r of R) {
    for (const f of [...(r.req || []), ...(r.ban || [])]) { used.add(f); if (!FEATURES.has(f)) problems.push(`No.${r.id} 知らない要素: ${f}（features に足す）`); }
    for (const k of r.x || []) xCount.set(k, (xCount.get(k) || 0) + 1);
  }
  const lonely = [...xCount].filter(([, n]) => n === 1).map(([k]) => k);
  const unused = [...FEATURES].filter((f) => !used.has(f));
  // p の付いたルールは本文に「◯人専用」とあるか
  for (const r of R) if (r.p && !String(r.text || '').includes(`${r.p}人専用`)) problems.push(`No.${r.id} p=${r.p} だが本文に「${r.p}人専用」が無い`);
  // 文字種チェック: 半角の引用符・アポストロフィ・波ダッシュの混在
  for (const r of R) {
    const all = [r.title, r.text, r.note || '', r.need || '', ...(r.list || [])].join(' ');
    if (/["']/.test(all)) problems.push(`No.${r.id} 半角の引用符がある`);
    if (/～/.test(all)) problems.push(`No.${r.id} 全角チルダ（～）がある。〜にそろえる`);
  }

  // 持ち時間（timer）: ルールとは別の番号（T01〜）。id の通し番号・★の並び・必須項目・タイトルの重複・文字種
  let timerLine = 'なし';
  if (D.timer !== undefined) {
    const TM = D.timer;
    if (!TM || typeof TM !== 'object' || !Array.isArray(TM.cards) || !TM.cards.length) problems.push('timer.cards が無い・0件');
    else {
      const C = TM.cards;
      const tno = (c) => 'T' + String(c.id).padStart(2, '0');
      for (const k of Object.keys(TM)) if (!['title', 'base', 'howto', 'startLv', 'roulette', 'cards'].includes(k)) problems.push(`timer の知らない項目: ${k}`);
      if (!TM.title) problems.push('timer.title が無い');
      // 秒数ルーレット（任意）: from < to・(to − from) が step で割り切れる・unit がある。出る数は 2〜100 通り
      let roulLine = '';
      if (TM.roulette !== undefined) {
        const RO = TM.roulette;
        if (!RO || typeof RO !== 'object' || Array.isArray(RO)) problems.push('timer.roulette がオブジェクトでない');
        else {
          for (const k of Object.keys(RO)) if (!['title', 'from', 'to', 'step', 'unit', 'howto'].includes(k)) problems.push(`timer.roulette の知らない項目: ${k}`);
          const { from, to, step } = RO;
          const nums = [from, to, step].every((v) => typeof v === 'number' && Number.isFinite(v));
          if (!nums) problems.push('timer.roulette の from・to・step は数で書く');
          else {
            const k = (to - from) / step;
            if (!(step > 0)) problems.push('timer.roulette.step は 0 より大きく');
            else if (!(from < to)) problems.push(`timer.roulette は from < to にする（いまは ${from} と ${to}）`);
            else if (Math.abs(k - Math.round(k)) > 1e-9) problems.push(`timer.roulette の (to − from) が step で割り切れない（${to} − ${from} を ${step} きざみ）`);
            else if (Math.round(k) + 1 > 100) problems.push(`timer.roulette の出る数が多すぎる（${Math.round(k) + 1}通り。100通りまで）`);
            else roulLine = ` / 秒数ルーレット: ${from}〜${to}${RO.unit || ''}（${step}${RO.unit || ''}きざみ・${Math.round(k) + 1}通り）`;
          }
          if (typeof RO.unit !== 'string' || !RO.unit.trim()) problems.push('timer.roulette.unit が無い（例: 秒）');
          if (RO.title !== undefined && (typeof RO.title !== 'string' || !RO.title.trim())) problems.push('timer.roulette.title が空');
          const all = [RO.title || '', RO.unit || '', RO.howto || ''].join(' ');
          if (/["']/.test(all)) problems.push('timer.roulette に半角の引用符がある');
          if (/～/.test(all)) problems.push('timer.roulette に全角チルダ（～）がある。〜にそろえる');
        }
      }
      if (!TM.base) problems.push('timer.base が無い（まだ引いていないときに出す、ふだんの持ち時間）');
      if (TM.startLv !== undefined && (!Array.isArray(TM.startLv) || !TM.startLv.length || TM.startLv.some((v) => ![1, 2, 3, 4, 5].includes(v)))) problems.push('timer.startLv が変');
      C.forEach((c, i) => { if (c.id !== i + 1) problems.push(`持ち時間の id の並び: index ${i} が id ${c.id}`); });
      const knownT = new Set(['id', 'lv', 'title', 'text', 'note', 'need']);
      const seenT = new Map();
      for (const c of C) {
        for (const k of ['id', 'lv', 'title', 'text']) if (c[k] === undefined || c[k] === '') problems.push(`${tno(c)} ${k} が無い`);
        if (![1, 2, 3, 4, 5].includes(c.lv)) problems.push(`${tno(c)} lv が変: ${c.lv}`);
        for (const k of Object.keys(c)) if (!knownT.has(k)) problems.push(`${tno(c)} 知らない項目: ${k}`);
        if (seenT.has(c.title)) problems.push(`持ち時間のタイトル重複: ${c.title}（${seenT.get(c.title)} と ${tno(c)}）`);
        seenT.set(c.title, tno(c));
        const all = [c.title, c.text, c.note || '', c.need || ''].join(' ');
        if (/["']/.test(all)) problems.push(`${tno(c)} 半角の引用符がある`);
        if (/～/.test(all)) problems.push(`${tno(c)} 全角チルダ（～）がある。〜にそろえる`);
      }
      for (let i = 1; i < C.length; i++) if (C[i].lv < C[i - 1].lv) problems.push(`持ち時間の lv の並びが逆: ${tno(C[i])}`);
      const byLvT = {};
      for (const c of C) byLvT[c.lv] = (byLvT[c.lv] || 0) + 1;
      timerLine = `${C.length}枚 / 難易度別: ${JSON.stringify(byLvT)} / need あり: ${C.filter((c) => c.need).length}枚${roulLine}`;
    }
  }

  // 言葉（glossary）: term の空・重複、desc の空、tap は true / false
  let glossaryLine = 'なし';
  if (D.glossary !== undefined) {
    if (!Array.isArray(D.glossary)) problems.push('glossary が配列でない');
    else {
      const seenG = new Set();
      for (const g of D.glossary) {
        if (!g || typeof g !== 'object') { problems.push('glossary に変な項目がある'); continue; }
        if (!g.term || typeof g.term !== 'string' || !g.term.trim()) { problems.push('glossary に term が空のものがある'); continue; }
        if (seenG.has(g.term)) problems.push(`glossary の term 重複: ${g.term}`);
        seenG.add(g.term);
        if (!g.desc || typeof g.desc !== 'string') problems.push(`glossary「${g.term}」の desc が無い`);
        if (g.tap !== undefined && typeof g.tap !== 'boolean') problems.push(`glossary「${g.term}」の tap が true / false でない`);
        for (const k of Object.keys(g)) if (!['term', 'desc', 'tap'].includes(k)) problems.push(`glossary「${g.term}」の知らない項目: ${k}`);
        if (/["']/.test(g.desc || '') || /～/.test(g.desc || '')) problems.push(`glossary「${g.term}」に半角の引用符か「～」がある`);
      }
      glossaryLine = `${D.glossary.length}語（点線にするもの ${D.glossary.filter((g) => g && g.tap === true).length}語）`;
    }
  }

  // チーム戦（team）: formats（id の重複・players・base）と cards（id の通し番号・★の並び・必須・fmt・知らない項目・文字種）
  let teamLine = 'なし';
  if (D.team !== undefined) {
    const TM = D.team;
    if (!TM || typeof TM !== 'object' || !Array.isArray(TM.formats) || !TM.formats.length || !Array.isArray(TM.cards)) problems.push('team の formats か cards が無い');
    else {
      for (const k of Object.keys(TM)) if (!['title', 'howto', 'startLv', 'formats', 'cards'].includes(k)) problems.push(`team の知らない項目: ${k}`);
      if (!TM.title) problems.push('team.title が無い');
      if (TM.startLv !== undefined && (!Array.isArray(TM.startLv) || !TM.startLv.length || TM.startLv.some((v) => ![1, 2, 3, 4, 5].includes(v)))) problems.push('team.startLv が変');
      const fmtIds = new Set();
      for (const f of TM.formats) {
        if (!f || typeof f !== 'object' || !f.id) { problems.push('team.formats に id の無いものがある'); continue; }
        if (fmtIds.has(f.id)) problems.push(`team.formats の id 重複: ${f.id}`);
        fmtIds.add(f.id);
        if (!f.name) problems.push(`形 ${f.id} の name が無い`);
        if (!Number.isInteger(f.players) || f.players < 1) problems.push(`形 ${f.id} の players が変: ${f.players}`);
        else if (choices.length && !choices.includes(f.players)) problems.push(`形 ${f.id} の players（${f.players}）が meta.players の選択肢に無い`);
        if (!Array.isArray(f.base) || !f.base.length || f.base.some((b) => typeof b !== 'string' || !b)) problems.push(`形 ${f.id} の base が無い・空の行がある`);
        for (const k of Object.keys(f)) if (!['id', 'name', 'players', 'base'].includes(k)) problems.push(`形 ${f.id} の知らない項目: ${k}`);
      }
      const C = TM.cards;
      const cno = (c) => 'C' + String(c.id).padStart(2, '0');
      C.forEach((c, i) => { if (c.id !== i + 1) problems.push(`チーム戦の id の並び: index ${i} が id ${c.id}`); });
      const knownC = new Set(['id', 'lv', 'title', 'text', 'list', 'note', 'need', 'fmt', 'x']);
      const seenC = new Map();
      const xC = new Map();
      for (const c of C) {
        for (const k of ['id', 'lv', 'title', 'text']) if (c[k] === undefined || c[k] === '') problems.push(`${cno(c)} ${k} が無い`);
        if (![1, 2, 3, 4, 5].includes(c.lv)) problems.push(`${cno(c)} lv が変: ${c.lv}`);
        for (const k of Object.keys(c)) if (!knownC.has(k)) problems.push(`${cno(c)} 知らない項目: ${k}`);
        for (const k of ['list', 'fmt', 'x']) if (c[k] !== undefined && !Array.isArray(c[k])) problems.push(`${cno(c)} ${k} が配列でない`);
        for (const f of c.fmt || []) if (!fmtIds.has(f)) problems.push(`${cno(c)} 知らない形: ${f}`);
        for (const k of c.x || []) xC.set(k, (xC.get(k) || 0) + 1);
        if (seenC.has(c.title)) problems.push(`チーム戦のタイトル重複: ${c.title}（${seenC.get(c.title)} と ${cno(c)}）`);
        seenC.set(c.title, cno(c));
        const all = [c.title, c.text, c.note || '', c.need || '', ...(c.list || [])].join(' ');
        if (/["']/.test(all)) problems.push(`${cno(c)} 半角の引用符がある`);
        if (/～/.test(all)) problems.push(`${cno(c)} 全角チルダ（～）がある。〜にそろえる`);
      }
      for (let i = 1; i < C.length; i++) if (C[i].lv < C[i - 1].lv) problems.push(`チーム戦の lv の並びが逆: ${cno(C[i])}`);
      const byLvC = {};
      for (const c of C) byLvC[c.lv] = (byLvC[c.lv] || 0) + 1;
      const perFmt = TM.formats.map((f) => `${f.id}=${C.filter((c) => !c.fmt || c.fmt.includes(f.id)).length}`).join('・');
      const lonelyC = [...xC].filter(([, n]) => n === 1).map(([k]) => k);
      teamLine = `${TM.formats.length}形 / ${C.length}枚 / 難易度別: ${JSON.stringify(byLvC)} / 形ごと: ${perFmt} / x のグループ（1枚しかないもの）: ${lonelyC.join(', ') || 'なし'}`;
    }
  }

  // 両立判定（画面と同じ規則）
  const compat = R.map((a) => R.filter((b) => b !== a && !conflicts(a, b)).length);
  const minCompat = R.length ? Math.min(...compat) : 0;

  // 件数
  const byLv = {}; const byCat = {};
  for (const r of R) { byLv[r.lv] = (byLv[r.lv] || 0) + 1; byCat[r.cat] = (byCat[r.cat] || 0) + 1; }
  const lens = R.map((r) => String(r.text || '').length).sort((a, b) => a - b);

  console.log('件数:', R.length);
  console.log('難易度別:', JSON.stringify(byLv));
  console.log('ジャンル別:', (D.cats || []).map((c) => `${c.name}=${byCat[c.key] || 0}`).join(' / '));
  console.log('本文の長さ: 最短', lens[0], '中央', lens[Math.floor(lens.length / 2)], '最長', lens[lens.length - 1]);
  console.log('x のグループ（1件しかないもの）:', lonely.join(', ') || 'なし');
  console.log('いちばん相性の悪いルールでも両立できる相手:', minCompat, '件');
  console.log('need あり:', R.filter((r) => r.need).length, '件 / p あり:', R.filter((r) => r.p).length, '件 / list あり:', R.filter((r) => r.list).length, '件');
  console.log('両立しない組（全体）:', R.reduce((n, a, i) => n + R.slice(i + 1).filter((b) => conflicts(a, b)).length, 0), '組');
  console.log('使われていない要素（features）:', unused.join(', ') || 'なし');
  console.log('持ち時間:', timerLine);
  console.log('言葉:', glossaryLine);
  console.log('チーム戦:', teamLine);
  console.log(problems.length ? '問題:\n- ' + problems.join('\n- ') : '問題: なし');
  if (problems.length) failedGames++;
}
process.exit(failedGames ? 1 : 0);
