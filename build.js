/*
 * build.js — sinh quiz/index.html tự chứa từ "AIF-C01 questions.json".
 *
 * Chạy:  node build.js
 *
 * Dữ liệu được NHÚNG THẲNG vào index.html dưới dạng <script>const QUESTIONS=[...]</script>
 * vì file HTML sẽ được mở bằng double-click (file://), nơi fetch() một file JSON local
 * bị CORS chặn. Không dùng fetch/XHR, không cần web server.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'AIF-C01 questions.json');
const TEMPLATE = path.join(__dirname, 'template.html');
const APP = path.join(__dirname, 'app.js');
const FIXES_FILE = path.join(__dirname, 'answer-fixes.json');
const KEYS_FILE = path.join(__dirname, 'answer-keys-v2.json');
const VI_DIR = path.join(__dirname, 'explanations');
const HOTSPOT_DIR = path.join(__dirname, 'hotspot');
const OUT = path.join(__dirname, 'index.html');

const MAX_EXPLANATION_ITEMS = 3;
const MAX_EXPLANATION_CHARS = 600;

/* Câu hỏi dạng "(Choose two.)" cần nhiều đáp án. */
function requiredPicks(questionText) {
  const t = String(questionText || '');
  if (/\((?:choose|select)\s+three\.?\)|\(choose\s+3\.?\)/i.test(t)) return 3;
  if (/\((?:choose|select)\s+two\.?\)|\(choose\s+2\.?\)/i.test(t)) return 2;
  return 1;
}

/* Đáp án đơn: most_voted, nếu rỗng thì lấy ký tự đầu của community_answer ("C. ..."). */
function singleAnswer(item, optKeys) {
  const mv = String(item.most_voted || '').trim().toUpperCase();
  if (optKeys.includes(mv)) return [mv];
  const m = /^\s*([A-E])\s*[.)\-:]/.exec(String(item.community_answer || ''));
  if (m && optKeys.includes(m[1])) return [m[1]];
  return [];
}

/* Đáp án nhiều lựa chọn: lấy top-N từ vote_counts. Hòa ở ranh giới -> coi như chưa có đáp án. */
function multiAnswer(item, optKeys, need) {
  const entries = Object.entries(item.vote_counts || {})
    .filter(([k, v]) => optKeys.includes(k) && typeof v === 'number' && v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length < need) return [];
  if (entries.length > need && entries[need - 1][1] === entries[need][1]) return []; // hòa, không xác định
  return entries.slice(0, need).map(e => e[0]).sort();
}

function buildExplanation(item) {
  const out = [];
  const ca = String(item.community_answer || '').trim();
  if (ca && ca.toLowerCase() !== 'not available') out.push('Đáp án cộng đồng: ' + ca);

  const cleaned = (Array.isArray(item.discussion) ? item.discussion : [])
    .map(d => String(d || '').replace(/\s*upvoted\s+\d+\s+times?\s*$/i, '').trim())
    .filter(Boolean);

  cleaned
    .slice()
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_EXPLANATION_ITEMS)
    .forEach(t => {
      out.push(t.length > MAX_EXPLANATION_CHARS
        ? t.slice(0, MAX_EXPLANATION_CHARS).trimEnd() + '…'
        : t);
    });

  return out;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('File nguồn không phải là một mảng JSON.');

  const fixes = fs.existsSync(FIXES_FILE)
    ? JSON.parse(fs.readFileSync(FIXES_FILE, 'utf8'))
    : {};

  /* Giải thích tiếng Việt: gộp mọi file .json trong quiz/explanations/ */
  const viMap = {};
  if (fs.existsSync(VI_DIR)) {
    fs.readdirSync(VI_DIR).filter(f => /\.json$/i.test(f)).sort().forEach(f => {
      const part = JSON.parse(fs.readFileSync(path.join(VI_DIR, f), 'utf8'));
      Object.keys(part).forEach(k => { if (k.charAt(0) !== '_') viMap[k] = part[k]; });
    });
  }

  /* Khoá đáp án chính thức trích từ HTML exam simulator (data-correct). */
  const keysFile = fs.existsSync(KEYS_FILE)
    ? JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'))
    : { keys: {} };
  const officialKeys = keysFile.keys || {};

  /* Câu HOTSPOT (ô sổ xuống) — gộp mọi file .json trong quiz/hotspot/ */
  const hotMap = {};
  if (fs.existsSync(HOTSPOT_DIR)) {
    fs.readdirSync(HOTSPOT_DIR).filter(f => /\.json$/i.test(f)).sort().forEach(f => {
      const part = JSON.parse(fs.readFileSync(path.join(HOTSPOT_DIR, f), 'utf8'));
      Object.keys(part).forEach(k => { if (k.charAt(0) !== '_') hotMap[k] = part[k]; });
    });
  }

  const questions = [];
  let dropped = 0, needsKeyCount = 0, multiCount = 0, fixedCount = 0, viCount = 0, hotCount = 0;
  let keyedCount = 0, keyChanged = 0;
  const keyChanges = [];
  const missingVi = [], viMismatch = [];

  raw.forEach((item, id) => {
    const options = item.options && typeof item.options === 'object' ? item.options : {};
    const optKeys = Object.keys(options).sort();

    /* Edge case 1: options rỗng. Trước đây loại bỏ hoàn toàn; nay nếu có dữ liệu
       HOTSPOT tương ứng thì dựng lại thành câu hỏi ô sổ xuống. */
    if (optKeys.length === 0) {
      const hs = hotMap[String(id)];
      if (hs && Array.isArray(hs.slots) && hs.slots.length) {
        hotCount++;
        if (hs.vi) viCount++;
        questions.push({
          id: id,
          no: hs.no || (id + 1),
          type: 'hotspot',
          question: String(hs.intro || '').trim(),
          choices: hs.choices.slice(),
          slots: hs.slots.map(s => ({ l: s.l, a: s.a })),
          options: {},
          answer: hs.slots.map(s => s.a),
          pick: hs.slots.length,
          needsKey: false,
          fixed: false,
          keyed: false,
          viExp: true,
          explanation: [String(hs.vi || '').trim()].filter(Boolean),
          url: String(item.url || '')
        });
      } else {
        dropped++;
      }
      return;
    }

    const pick = requiredPicks(item.question);
    if (pick > 1) multiCount++;

    let answer = pick > 1
      ? multiAnswer(item, optKeys, pick)
      : singleAnswer(item, optKeys);

    /* Ưu tiên khoá đáp án chính thức (data-correct) hơn đáp án suy từ vote_counts. */
    const inferred = answer.join('');
    let keyed = false;
    const ok = officialKeys[String(id)];
    if (ok && ok.answer) {
      const kk = String(ok.answer).toUpperCase().replace(/[^A-E]/g, '')
        .split('').filter((k, i, a) => optKeys.includes(k) && a.indexOf(k) === i).sort();
      if (kk.length) {
        keyed = true; keyedCount++;
        if (kk.join('') !== inferred) {
          keyChanged++;
          keyChanges.push('id=' + id + ': suy luận ' + (inferred || '(trống)') + ' -> khoá chính thức ' + kk.join(''));
        }
        answer = kk;
      }
    }

    /* Đáp án đã rà soát thủ công (answer-fixes.json) ghi đè mọi nguồn khác. */
    let fixed = false, fixReason = null;
    const fx = fixes[String(id)];
    if (fx && fx.answer) {
      const corrected = String(fx.answer).toUpperCase().replace(/[^A-E]/g, '')
        .split('').filter((k, i, a) => optKeys.includes(k) && a.indexOf(k) === i).sort();
      if (corrected.length) {
        if (corrected.join('') !== answer.join('')) { fixed = true; fixedCount++; }
        answer = corrected;
        fixReason = fx.reason || null;
      }
    }

    /* Giải thích: ưu tiên bản tiếng Việt, chỉ dùng thảo luận cộng đồng khi chưa có. */
    const viEntry = viMap[String(id)];
    let explanation, viExp = false;
    if (viEntry && viEntry.vi) {
      explanation = [viEntry.vi];
      viExp = true;
      viCount++;
      const expect = String(viEntry.answer || '').toUpperCase().replace(/[^A-E]/g, '')
        .split('').sort().join('');
      if (expect && expect !== answer.join('')) {
        viMismatch.push('id=' + id + ' (giải thích ghi ' + expect + ', đáp án hiện tại ' + answer.join('') + ')');
      }
    } else {
      explanation = buildExplanation(item);
      missingVi.push(id);
    }
    if (fixReason) explanation.unshift('[Đã rà soát] ' + fixReason);

    // Edge case 2: không xác định được đáp án -> needsKey.
    const needsKey = answer.length === 0;
    if (needsKey) needsKeyCount++;

    const m = /question\s+(\d+)/i.exec(String(item.question_no || ''));
    const no = m ? parseInt(m[1], 10) : id + 1;

    questions.push({
      id,
      no,
      question: String(item.question || '').trim(),
      options,                       // Edge case 3: giữ nguyên số khóa thực tế (A–D hoặc A–E)
      answer,
      pick,
      needsKey,
      fixed,
      keyed,
      viExp,
      explanation,
      url: String(item.url || '')
    });
  });

  const meta = {
    rawTotal: raw.length,
    usable: questions.length,
    dropped,
    needsKey: needsKeyCount,
    multi: multiCount,
    hotspot: hotCount,
    fixed: fixedCount,
    builtAt: new Date().toISOString()
  };

  // Chặn chuỗi "</script" làm vỡ thẻ script khi nhúng.
  const safe = s => s.replace(/</g, '\\u003c');

  const dataBlock =
    'const QUIZ_META = ' + safe(JSON.stringify(meta)) + ';\n' +
    'const QUESTIONS = ' + safe(JSON.stringify(questions)) + ';';

  const html = fs.readFileSync(TEMPLATE, 'utf8')
    .replace('/*__QUESTIONS__*/', () => dataBlock)
    .replace('/*__APP__*/', () => fs.readFileSync(APP, 'utf8'));

  fs.writeFileSync(OUT, html, 'utf8');

  const bytes = fs.statSync(OUT).size;
  console.log('--- Kết quả build ---');
  console.log('Tổng câu trong file gốc      : ' + meta.rawTotal);
  console.log('Bị loại vì thiếu options     : ' + meta.dropped);
  console.log('Số câu khả dụng              : ' + meta.usable);
  console.log('Câu chưa có đáp án chuẩn     : ' + meta.needsKey);
  console.log('Câu chọn nhiều đáp án        : ' + meta.multi);
  console.log('Câu HOTSPOT (ô sổ xuống)     : ' + hotCount);
  console.log('Đáp án đã sửa sau rà soát    : ' + meta.fixed);
  console.log('Khoá đáp án chính thức       : ' + keyedCount + '/' + questions.length +
    '  (đổi so với suy luận: ' + keyChanged + ')');
  keyChanges.forEach(c => console.log('   ' + c));
  console.log('Giải thích tiếng Việt        : ' + viCount + '/' + questions.length +
    (missingVi.length ? '  (còn thiếu ' + missingVi.length + ' câu, đang dùng thảo luận cộng đồng)' : '  ✔ đủ'));
  if (viMismatch.length) {
    console.log('!! CẢNH BÁO — giải thích lệch đáp án (' + viMismatch.length + '):');
    viMismatch.forEach(m => console.log('   ' + m));
  }
  if (missingVi.length && missingVi.length <= 40) {
    console.log('   id chưa có giải thích: ' + missingVi.join(', '));
  }
  console.log('Kích thước index.html        : ' + bytes + ' bytes (' +
    (bytes / 1024).toFixed(1) + ' KB)');
  console.log('Đã ghi: ' + OUT);
}

main();
