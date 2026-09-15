/* Ứng dụng thi trắc nghiệm AIF-C01 — vanilla JS, không phụ thuộc thư viện ngoài. */
(function () {
  'use strict';

  var LS_OVR = 'aif_answer_overrides';
  var LS_BM = 'aif_bookmarks';
  var LS_HIST = 'aif_history';

  var EXAM_COUNT = 65;
  var EXAM_SECONDS = 90 * 60;
  var WARN_SECONDS = 10 * 60;

  var SET_SIZE = 50;        /* số câu mỗi bộ học */
  var MASTER_STREAK = 2;    /* đúng liên tiếp bao nhiêu lần thì coi là đã thuộc */

  /* ---------- tiện ích ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* hết dung lượng */ }
  }

  /* Một số môi trường (trình xem tài liệu trên điện thoại, chế độ ẩn danh, iframe bị hạn chế)
     chặn localStorage. App vẫn chạy được nhưng dữ liệu không lưu — cần báo cho người dùng. */
  var storageOk = (function () {
    try {
      var k = '__aif_probe__';
      localStorage.setItem(k, '1');
      var ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      return ok;
    } catch (e) { return false; }
  })();
  function letter(i) { return String.fromCharCode(65 + i); }

  /* =====================================================================
     TÔ SÁNG TỪ KHOÁ
     kq = từ ràng buộc quyết định đáp án (MOST, LEAST, NOT, Choose two, real time...)
     kw = tên dịch vụ AWS và thuật ngữ kỹ thuật
     ===================================================================== */

  /* Ràng buộc — viết HOA trong đề nên khớp phân biệt hoa/thường để không bắt nhầm văn xuôi. */
  var KQ_CS = [
    'MOST cost-effectively', 'MOST cost-effective', 'MOST operationally efficient',
    'LEAST operational overhead', 'LEAST development effort', 'LEAST implementation effort',
    'LEAST administrative effort', 'LEAST operational effort', 'LEAST effort',
    'MOST', 'LEAST', 'BEST', 'NOT', 'ALL', 'ONLY'
  ];
  /* Ràng buộc — không phân biệt hoa/thường. */
  var KQ_CI = [
    'Choose two', 'Choose three', 'Select two', 'Select three',
    'near real-time', 'near real time', 'real-time', 'real time',
    'without managing', 'without writing any code', 'without additional training',
    'without any code', 'without re-training', 'without human intervention',
    'does not have', 'does not need', 'do not have', 'cannot',
    'unlabeled', 'labeled', 'minimal programming', 'minimal ML knowledge',
    'no coding experience', 'lowest', 'highest', 'minimize', 'maximize',
    'immediately', 'once each day', 'once daily', 'limited budget',
    'no internet access', 'not allowed', 'must not', 'lowest latency',
    'quickly', 'continuously', 'automatically', 'in real time'
  ];

  /* Dịch vụ / tính năng AWS — cụm dài đặt trước để ưu tiên khớp dài nhất. */
  var KW_CI = [
    'Amazon SageMaker Ground Truth Plus', 'Amazon SageMaker Serverless Inference',
    'Amazon SageMaker Unified Studio', 'Amazon SageMaker Model Registry',
    'Amazon SageMaker Data Wrangler', 'Amazon SageMaker Feature Store',
    'Amazon SageMaker Ground Truth', 'Amazon SageMaker Model Monitor',
    'Amazon SageMaker Model Cards', 'Amazon SageMaker Model Card',
    'Amazon SageMaker JumpStart', 'Amazon SageMaker Autopilot',
    'Amazon SageMaker Debugger', 'Amazon SageMaker Pipelines',
    'Amazon SageMaker HyperPod', 'Amazon SageMaker Clarify',
    'Amazon SageMaker Catalog', 'Amazon SageMaker Canvas',
    'Amazon SageMaker Studio', 'Amazon SageMaker AI', 'Amazon SageMaker',
    'SageMaker Ground Truth Plus', 'SageMaker Serverless Inference',
    'SageMaker Unified Studio', 'SageMaker Model Registry', 'SageMaker Data Wrangler',
    'SageMaker Feature Store', 'SageMaker Ground Truth', 'SageMaker Model Monitor',
    'SageMaker Model Cards', 'SageMaker Model Card', 'SageMaker JumpStart',
    'SageMaker Autopilot', 'SageMaker Debugger', 'SageMaker Pipelines',
    'SageMaker HyperPod', 'SageMaker Clarify', 'SageMaker Clarity',
    'SageMaker Catalog', 'SageMaker Canvas', 'SageMaker Studio', 'SageMaker',
    'Amazon Bedrock Knowledge Bases', 'Amazon Bedrock Guardrails',
    'Guardrails for Amazon Bedrock', 'Amazon Bedrock Agents', 'Amazon Bedrock',
    'Bedrock Knowledge Bases', 'Bedrock Guardrails', 'Bedrock Agents', 'Bedrock',
    'Knowledge Bases', 'Knowledge Base', 'Guardrails', 'Guardrail',
    'PartyRock', 'Prompt Management', 'prompt router', 'Provisioned Throughput',
    'On-Demand', 'intelligent prompt routing', 'Custom Model Import',
    'Amazon Q in Amazon QuickSight', 'Amazon Q in QuickSight', 'Amazon Q Developer',
    'Amazon Q Business', 'Amazon Q index', 'Amazon Q', 'Q Developer', 'Q Business',
    'Amazon Comprehend Medical', 'Amazon Comprehend', 'Comprehend Medical', 'Comprehend',
    'Amazon Augmented AI', 'Amazon Rekognition', 'Amazon Transcribe', 'Amazon Translate',
    'Amazon Textract', 'Amazon Personalize', 'Amazon Forecast', 'Amazon Fraud Detector',
    'Amazon Kendra', 'Amazon Polly', 'Amazon Lex', 'AWS HealthScribe', 'HealthScribe',
    'Rekognition', 'Transcribe', 'Translate', 'Textract', 'Personalize',
    'Fraud Detector', 'Kendra', 'Polly', 'Lex',
    'Amazon OpenSearch Service', 'OpenSearch Service', 'OpenSearch',
    'Amazon Aurora PostgreSQL', 'Aurora PostgreSQL', 'Amazon Aurora',
    'Amazon Neptune', 'Amazon DynamoDB', 'Amazon Redshift', 'Amazon Athena',
    'Amazon MemoryDB', 'Amazon ElastiCache', 'Amazon EMR',
    'Neptune', 'DynamoDB', 'Redshift', 'Athena', 'ElastiCache',
    'AWS Key Management Service', 'AWS Identity and Access Management',
    'AWS Audit Manager', 'AWS Trusted Advisor', 'AWS CloudTrail Lake', 'AWS CloudTrail',
    'Amazon CloudWatch', 'AWS PrivateLink', 'AWS Artifact', 'AWS Config',
    'Amazon Macie', 'Amazon Inspector', 'AWS Lake Formation', 'AWS Data Exchange',
    'AWS Secrets Manager', 'AWS Security Token Service', 'AWS Outposts',
    'Amazon API Gateway', 'Amazon CloudFront', 'AWS Lambda', 'AWS Glue',
    'AWS DeepRacer', 'AWS Batch', 'AWS Snowcone',
    'CloudTrail Lake', 'CloudTrail', 'CloudWatch', 'PrivateLink', 'Audit Manager',
    'Trusted Advisor', 'Artifact', 'Macie', 'Inspector', 'Lake Formation',
    'Secrets Manager', 'Lambda', 'Glue', 'CloudFront', 'API Gateway',
    'Amazon Elastic Kubernetes Service', 'Amazon Elastic Block Store',
    'Amazon Elastic File System', 'Amazon QuickSight', 'QuickSight',
    'Amazon S3', 'Amazon EC2', 'S3 Intelligent-Tiering', 'S3 Glacier Deep Archive',
    'S3 Standard', 'Mechanical Turk',
    'Amazon Titan Multimodal Embeddings', 'Amazon Titan Image Generator',
    'Amazon Titan Text', 'Amazon Titan', 'Titan',
    'Amazon Nova Canvas', 'Amazon Nova Micro', 'Amazon Nova Reel',
    'Amazon Nova Lite', 'Amazon Nova Pro', 'Amazon Nova',
    'Nova Canvas', 'Nova Micro', 'Nova Reel', 'Nova Lite', 'Nova Pro', 'Nova',
    'Stable Diffusion', 'Model Context Protocol'
  ];

  /* Thuật ngữ ML / GenAI. */
  var KW_TERMS_CI = [
    'Retrieval Augmented Generation', 'Reinforcement learning from human feedback',
    'reinforcement learning', 'supervised learning', 'unsupervised learning',
    'semi-supervised learning', 'transfer learning', 'federated learning',
    'active learning', 'deep learning', 'continued pre-training',
    'continuous pre-training', 'ongoing pre-training', 'continues pre-training',
    'pre-training', 'pre-trained', 'fine-tuning', 'fine-tune', 'fine-tuned',
    'instruction-based fine-tuning', 'model distillation', 'model quantization',
    'prompt engineering', 'prompt injection', 'prompt leakage', 'prompt template',
    'prompt chaining', 'chain-of-thought', 'few-shot', 'one-shot', 'zero-shot',
    'least-to-most prompting', 'directional stimulus', 'negative prompt',
    'system prompt', 'adversarial prompting', 'tree of thoughts', 'jailbreak',
    'reasoning and acting', 'ReAct',
    'temperature', 'Top K', 'Top P', 'context window', 'context size',
    'max tokens', 'maximum tokens', 'token', 'embedding', 'vector database',
    'vector', 'epoch', 'hyperparameter', 'batch size', 'learning rate',
    'regularization', 'overfit', 'underfit', 'hallucination', 'hallucinating',
    'data drift', 'model drift', 'concept drift', 'drift', 'data poisoning',
    'foundation model', 'large language model', 'small language model',
    'multi-modal', 'multimodal', 'modality', 'generative AI', 'nondeterministic',
    'nondeterminism', 'deterministic', 'inference latency', 'inference speed',
    'real-time inference', 'batch inference', 'asynchronous inference',
    'serverless inference', 'batch transform', 'network isolation',
    'anomaly detection', 'object detection', 'named entity recognition',
    'sentiment analysis', 'summarization', 'computer vision',
    'natural language processing', 'intelligent document processing',
    'classification', 'clustering', 'regression', 'binary classification',
    'multi-class classification', 'time series', 'tokenization',
    'confusion matrix', 'accuracy', 'precision', 'recall', 'F1 score',
    'BERTScore', 'perplexity', 'root mean squared error', 'R-squared',
    'Bilingual Evaluation Understudy', 'Recall-Oriented Understudy for Gisting Evaluation',
    'benchmark dataset', 'human evaluation', 'automatic model evaluation',
    'explainability', 'interpretability', 'transparency', 'fairness',
    'responsible AI', 'governance', 'data residency', 'data retention',
    'data lifecycle', 'human-in-the-loop', 'Shapley values', 'partial dependence',
    'bias', 'toxicity', 'personally identifiable information',
    'generative adversarial network', 'variational autoencoder', 'autoencoder',
    'transformer', 'diffusion model', 'neural network', 'decision tree',
    'logistic regression', 'linear regression', 'random cut forest',
    'support vector machine', 'k-nearest neighbors', 'K-means', 'XGBoost',
    'DeepAR', 'BERT', 'self-attention', 'chunking', 'structured data',
    'unstructured data', 'synthetic data', 'data augmentation',
    'feature engineering', 'exploratory data analysis', 'class imbalance',
    'A/B testing', 'MLOps', 'infrastructure as code',
    /* Kiểu dữ liệu / bài toán — chỉ chọn từ có tính phân biệt cao, tránh làm loãng. */
    'audio', 'speech', 'scanned', 'PDF', 'subtitle', 'subtitles', 'voice-over',
    'handwritten', 'churn', 'fraud', 'forecast', 'demand', 'resume', 'resumes',
    'image classification', 'text summarization', 'question answering'
  ];

  /* Từ viết tắt — chỉ khớp đúng dạng viết HOA. */
  var KW_CS = [
    'RAG', 'LLM', 'LLMs', 'FM', 'FMs', 'SLM', 'SLMs', 'NLP', 'ML', 'AI',
    'RLHF', 'PII', 'IAM', 'KMS', 'GAN', 'VAE', 'PDP', 'PDPs', 'BLEU', 'ROUGE',
    'AUC', 'RMSE', 'MSE', 'CSAT', 'AHT', 'CFG', 'IDP', 'MCP', 'ISO', 'SQL',
    'GPT', 'API', 'APIs', 'VPC', 'S3', 'EC2', 'EKS', 'EBS', 'EFS', 'A2I',
    'ROI', 'k-NN', 'SSE-S3'
  ];

  function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

  /* Ranh giới: chỉ chặn khi ký tự kề là chữ/số, để cụm có '-' hay '/' vẫn khớp đúng. */
  function buildRe(list, flags) {
    var src = list.slice().sort(function (a, b) { return b.length - a.length; })
      .map(reEscape).join('|');
    return new RegExp('(?:^|(?<![A-Za-z0-9]))(?:' + src + ')(?![A-Za-z0-9])', flags);
  }

  var MATCHERS = null;
  function matchers() {
    if (MATCHERS) return MATCHERS;
    try {
      MATCHERS = [
        { re: buildRe(KQ_CS, 'g'), cls: 'kq' },
        { re: buildRe(KQ_CI, 'gi'), cls: 'kq' },
        { re: buildRe(KW_CS, 'g'), cls: 'kw' },
        { re: buildRe(KW_CI.concat(KW_TERMS_CI), 'gi'), cls: 'kw' }
      ];
    } catch (e) {
      MATCHERS = []; // trình duyệt cũ không hỗ trợ lookbehind -> bỏ tô sáng
    }
    return MATCHERS;
  }

  var highlightOn = load('aif_highlight', true) !== false;

  /* Trả về HTML đã escape, có chèn <mark>. Không bao giờ nhận HTML thô từ dữ liệu. */
  function hl(text) {
    var s = String(text == null ? '' : text);
    var ms = matchers();
    if (!highlightOn || !ms.length) return esc(s);

    var hits = [];
    ms.forEach(function (m) {
      m.re.lastIndex = 0;
      var r;
      while ((r = m.re.exec(s)) !== null) {
        if (r[0].length) hits.push({ start: r.index, end: r.index + r[0].length, cls: m.cls });
        if (m.re.lastIndex === r.index) m.re.lastIndex++;
      }
    });
    if (!hits.length) return esc(s);

    /* Khớp dài nhất thắng; cùng độ dài thì ưu tiên kq (từ ràng buộc). */
    hits.sort(function (a, b) {
      return a.start - b.start ||
        (b.end - b.start) - (a.end - a.start) ||
        (a.cls === 'kq' ? -1 : 1);
    });

    var out = '', pos = 0;
    hits.forEach(function (h) {
      if (h.start < pos) return;               // chồng lấn -> bỏ
      out += esc(s.slice(pos, h.start));
      out += '<mark class="' + h.cls + '">' + esc(s.slice(h.start, h.end)) + '</mark>';
      pos = h.end;
    });
    out += esc(s.slice(pos));
    return out;
  }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) return false;
    return true;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fmtClock(sec) {
    if (sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- trạng thái lưu trữ ---------- */
  var overrides = load(LS_OVR, {}) || {};
  var bookmarks = load(LS_BM, []) || [];
  var hist = load(LS_HIST, null);
  if (!hist || typeof hist !== 'object') hist = { exams: [], practiceWrong: [] };
  if (Array.isArray(hist)) hist = { exams: hist, practiceWrong: [] };
  if (!Array.isArray(hist.exams)) hist.exams = [];
  if (!Array.isArray(hist.practiceWrong)) hist.practiceWrong = [];
  /* progress[id] = { s: số lần đúng liên tiếp, n: tổng số lần đã làm } */
  if (!hist.progress || typeof hist.progress !== 'object') hist.progress = {};

  var BY_ID = {};
  QUESTIONS.forEach(function (q) { BY_ID[q.id] = q; });

  /* ---------- đáp án hiệu lực (có tính override) ---------- */
  function parseLetters(str, optKeys) {
    var out = [];
    String(str || '').toUpperCase().replace(/[^A-E]/g, '').split('').forEach(function (ch) {
      if (optKeys.indexOf(ch) !== -1 && out.indexOf(ch) === -1) out.push(ch);
    });
    out.sort();
    return out;
  }
  function hasOverride(q) {
    return Object.prototype.hasOwnProperty.call(overrides, String(q.id));
  }
  function effAnswer(q) {
    /* Hotspot: đáp án là mảng chuỗi theo thứ tự dòng, không áp cơ chế override A–E. */
    if (isHot(q)) return q.answer.slice();
    var keys = Object.keys(q.options);
    if (hasOverride(q)) {
      var got = parseLetters(overrides[String(q.id)].answer, keys);
      if (got.length) return got;
    }
    return q.answer.slice();
  }
  function effNeedsKey(q) { return effAnswer(q).length === 0; }
  function examPool() { return QUESTIONS.filter(function (q) { return !effNeedsKey(q); }); }

  /* =====================================================================
     TIẾN ĐỘ HỌC — bộ 50 câu và mức thuộc bài
     ===================================================================== */
  function progOf(q) { return hist.progress[String(q.id)] || { s: 0, n: 0 }; }
  function isMastered(q) { return progOf(q).s >= MASTER_STREAK; }
  function isSeen(q) { return progOf(q).n > 0; }

  function setCount() { return Math.ceil(QUESTIONS.length / SET_SIZE); }
  function setQuestions(i) {
    return QUESTIONS.slice(i * SET_SIZE, Math.min((i + 1) * SET_SIZE, QUESTIONS.length));
  }
  function setStats(i) {
    var qs = setQuestions(i), seen = 0, mastered = 0;
    qs.forEach(function (q) {
      if (isSeen(q)) seen++;
      if (isMastered(q)) mastered++;
    });
    return { total: qs.length, seen: seen, mastered: mastered, from: i * SET_SIZE + 1,
             to: i * SET_SIZE + qs.length };
  }
  function unmasteredAll() { return QUESTIONS.filter(function (q) { return !isMastered(q); }); }

  function recordProgress(q, correct) {
    var p = progOf(q);
    hist.progress[String(q.id)] = { s: correct ? p.s + 1 : 0, n: p.n + 1 };
    save(LS_HIST, hist);
  }

  function wrongIdSet() {
    var set = {};
    hist.practiceWrong.forEach(function (id) { set[id] = true; });
    hist.exams.forEach(function (e) {
      (e.wrongIds || []).forEach(function (id) { set[id] = true; });
    });
    return set;
  }

  /* ---------- điều hướng màn hình ---------- */
  var SCREENS = ['scHome', 'scExam', 'scResult', 'scPractice'];
  function show(id, topLabel, withTimer) {
    SCREENS.forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
    $('topbar').classList.toggle('hidden', id === 'scHome');
    $('topLabel').textContent = topLabel || '';
    $('timer').classList.toggle('hidden', !withTimer);
    window.scrollTo(0, 0);
  }

  /* ---------- trang chính ---------- */
  function renderHome() {
    $('storageWarn').classList.toggle('hidden', storageOk);
    var pool = examPool();
    $('hTotal').textContent = QUESTIONS.length;
    $('hExam').textContent = pool.length;
    $('hNeed').textContent = QUESTIONS.length - pool.length;
    $('hOvr').textContent = Object.keys(overrides).length;
    $('hBm').textContent = bookmarks.length;

    $('hDropped').textContent =
      'Đã loại ' + QUIZ_META.dropped + ' câu thiếu lựa chọn khỏi mọi bộ đề (tổng ' +
      QUIZ_META.rawTotal + ' câu trong file gốc). ' +
      QUIZ_META.multi + ' câu thuộc dạng chọn nhiều đáp án.';

    var last = hist.exams[hist.exams.length - 1];
    if (last) {
      $('hLast').innerHTML =
        '<b>' + last.score + '%</b> — đúng ' + last.correct + '/' + last.total +
        ' câu, thời gian ' + fmtClock(last.timeUsed) + ' — ' + esc(fmtDate(last.date));
    } else {
      $('hLast').textContent = 'Chưa có lần thi nào.';
    }

    /* Ôn thông minh + lưới bộ 50 câu */
    var left = unmasteredAll().length;
    var masteredTotal = QUESTIONS.length - left;
    $('btnSmart').disabled = left === 0;
    $('smartNote').innerHTML = left === 0
      ? 'Bạn đã thuộc toàn bộ ' + QUESTIONS.length + ' câu. Rất tốt.'
      : 'Đã thuộc <b>' + masteredTotal + '/' + QUESTIONS.length + '</b> câu — còn <b>' + left +
        '</b> câu cần ôn. Ôn thông minh sẽ bỏ qua những câu bạn đã trả lời đúng ' +
        MASTER_STREAK + ' lần liên tiếp, nên càng học càng nhanh.';

    /* Nhóm câu ô sổ xuống (HOTSPOT) */
    var hotAll = QUESTIONS.filter(isHot);
    var hotMastered = hotAll.filter(isMastered).length;
    var hotSeen = hotAll.filter(isSeen).length;
    $('btnHotspot').disabled = hotAll.length === 0;
    $('hotNote').innerHTML = hotAll.length === 0 ? '' :
      'Nhóm <b>' + hotAll.length + ' câu ô sổ xuống</b> (HOTSPOT) — đã làm ' + hotSeen +
      ', đã thuộc <b>' + hotMastered + '/' + hotAll.length + '</b>. ' +
      'Đây là dạng khó nhớ nhất vì mỗi câu phải chọn đúng toàn bộ các ô mới được tính điểm.';

    $('setGrid').innerHTML = (function () {
      var out = [];
      for (var i = 0; i < setCount(); i++) {
        var s = setStats(i);
        var pct = Math.round((s.mastered / s.total) * 100);
        out.push('<button class="setcard' + (s.mastered === s.total ? ' done' : '') +
          '" data-set="' + i + '">' +
          '<div class="t">Bộ ' + (i + 1) + (s.mastered === s.total ? ' ✓' : '') + '</div>' +
          '<div class="r">câu ' + s.from + '–' + s.to + '</div>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="s">thuộc ' + s.mastered + '/' + s.total + ' · đã làm ' + s.seen + '</div>' +
          '</button>');
      }
      return out.join('');
    })();
    Array.prototype.forEach.call($('setGrid').querySelectorAll('.setcard'), function (b) {
      b.addEventListener('click', function () {
        var i = parseInt(b.getAttribute('data-set'), 10);
        var s = setStats(i);
        /* Bộ đã thuộc hết thì mở ở chế độ xem tất cả, còn lại ưu tiên câu chưa thuộc. */
        startPractice(i, s.mastered === s.total ? 'all' : 'unmastered');
      });
    });

    $('hHistWrap').classList.toggle('hidden', hist.exams.length === 0);
    $('hHist').innerHTML = hist.exams.slice().reverse().slice(0, 10).map(function (e) {
      return '<div class="histrow"><span class="grow">' + esc(fmtDate(e.date)) + '</span>' +
        '<span><b>' + e.score + '%</b></span><span>' + e.correct + '/' + e.total + ' đúng</span>' +
        '<span>' + fmtClock(e.timeUsed) + '</span></div>';
    }).join('');
  }

  /* ---------- dựng khối lựa chọn ---------- */
  /* orderedKeys: thứ tự hiển thị; value của input LUÔN là khóa gốc (A–E trong dữ liệu),
     nên việc xáo trộn chỉ ảnh hưởng cách hiển thị, không thể làm lệch khóa đúng. */
  function optionsHtml(q, orderedKeys, selected, multi, name) {
    return '<div class="opts">' + orderedKeys.map(function (k, i) {
      var checked = selected.indexOf(k) !== -1;
      return '<label class="opt' + (checked ? ' sel' : '') + '" data-key="' + k + '">' +
        '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + name + '" value="' + k + '"' +
        (checked ? ' checked' : '') + '>' +
        '<span class="lab">' + letter(i) + '.</span>' +
        '<span class="txt">' + hl(q.options[k]) + '</span></label>';
    }).join('') + '</div>';
  }

  function explanationHtml(q) {
    if (!q.explanation || !q.explanation.length) return '';
    return '<div class="exp"><b>' +
      (q.viExp ? 'Giải thích:' : 'Giải thích từ thảo luận cộng đồng:') + '</b><ul>' +
      q.explanation.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
      '</ul></div>';
  }

  function answerLabelText(q, keys, orderedKeys) {
    return keys.slice().sort().map(function (k) {
      var pos = orderedKeys.indexOf(k);
      return (pos >= 0 ? letter(pos) : k) + '. ' + q.options[k];
    }).join(' | ');
  }

  /* =====================================================================
     CÂU HOTSPOT — mỗi dòng một ô sổ xuống, giống giao diện thi thật
     Lựa chọn lưu dưới dạng mảng chuỗi theo đúng thứ tự dòng ('' = chưa chọn).
     ===================================================================== */
  function isHot(q) { return q.type === 'hotspot'; }

  /* Hotspot so khớp THEO THỨ TỰ (một giá trị có thể lặp ở nhiều dòng),
     khác hẳn trắc nghiệm thường vốn so khớp theo tập hợp. */
  function sameSeq(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function isCorrectAns(q, sel) {
    return isHot(q) ? sameSeq(sel, effAnswer(q)) : sameSet(sel, effAnswer(q));
  }
  function isAnswered(q, sel) {
    if (!isHot(q)) return sel.length > 0;
    if (sel.length !== q.slots.length) return false;
    for (var i = 0; i < sel.length; i++) if (!sel[i]) return false;
    return true;
  }
  function blankSel(q) {
    if (!isHot(q)) return [];
    return q.slots.map(function () { return ''; });
  }

  function hotspotHtml(q, sel, locked, showResult) {
    var ans = effAnswer(q);
    return '<div class="hs">' + q.slots.map(function (s, i) {
      var cur = sel[i] || '';
      var cls = showResult ? (cur === ans[i] ? ' correct' : ' wrong') : '';
      var opts = '<option value="">— Chọn —</option>' + q.choices.map(function (c) {
        return '<option value="' + esc(c) + '"' + (cur === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
      return '<div class="hs-row' + cls + '">' +
        '<div class="hs-label">' + hl(s.l) + '</div>' +
        '<select class="hs-sel" data-slot="' + i + '"' + (locked ? ' disabled' : '') + '>' + opts + '</select>' +
        (showResult && cur !== ans[i]
          ? '<div class="hs-fix">Đáp án đúng: ' + esc(ans[i]) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  /* Mô tả đáp án hotspot dạng "nhãn dòng → đáp án", dùng cho trang kết quả. */
  function hotAnswerText(q, sel) {
    var ans = effAnswer(q);
    return q.slots.map(function (s, i) {
      var v = sel ? (sel[i] || '(bỏ trống)') : ans[i];
      return s.l + ' → ' + v;
    }).join('  ·  ');
  }

  /* =====================================================================
     CHẾ ĐỘ THI THẬT
     ===================================================================== */
  var exam = null;

  function startExam() {
    var pool = examPool();
    if (pool.length === 0) { alert('Không có câu hỏi khả dụng.'); return; }
    var picked = shuffle(pool).slice(0, Math.min(EXAM_COUNT, pool.length));

    exam = {
      items: picked.map(function (q) {
        return { q: q, order: shuffle(Object.keys(q.options)), sel: blankSel(q), flagged: false };
      }),
      idx: 0,
      startedAt: Date.now(),
      deadline: Date.now() + EXAM_SECONDS * 1000,
      timerId: null,
      finished: false
    };

    verifyShuffle(exam);

    exam.timerId = setInterval(tickTimer, 250);
    tickTimer();
    show('scExam', 'Thi thật — ' + exam.items.length + ' câu', true);
    renderExam();
  }

  /* Kiểm chứng ánh xạ khóa đúng trước và sau khi xáo đáp án (log ra console). */
  function verifyShuffle(ex) {
    console.log('=== KIỂM CHỨNG XÁO ĐÁP ÁN (3 câu đầu của bộ đề) ===');
    ex.items.slice(0, 3).forEach(function (it, n) {
      var q = it.q, ans = effAnswer(q);
      var origKeys = Object.keys(q.options);
      console.log('--- Câu thứ ' + (n + 1) + ' trong đề | id=' + q.id + ' | câu số gốc ' + q.no);
      console.log('   TRƯỚC khi xáo: thứ tự ' + origKeys.join(',') +
        ' | đáp án đúng ' + ans.join('+') +
        ' -> ' + ans.map(function (k) { return k + '. ' + q.options[k]; }).join(' | '));
      console.log('   SAU khi xáo:   thứ tự ' + it.order.join(',') +
        ' | vị trí hiển thị của đáp án đúng ' +
        ans.map(function (k) { return letter(it.order.indexOf(k)); }).join('+') +
        ' -> ' + ans.map(function (k) {
          return letter(it.order.indexOf(k)) + '. ' + q.options[it.order[it.order.indexOf(k)]];
        }).join(' | '));
      var ok = ans.every(function (k) {
        var pos = it.order.indexOf(k);
        return pos !== -1 && it.order[pos] === k && q.options[it.order[pos]] === q.options[k];
      });
      console.log('   => Nội dung đáp án đúng giữ nguyên sau khi xáo: ' + (ok ? 'ĐẠT' : 'LỖI'));
    });
    console.log('=== HẾT KIỂM CHỨNG ===');
  }

  function tickTimer() {
    if (!exam || exam.finished) return;
    var left = Math.round((exam.deadline - Date.now()) / 1000);
    var el = $('timer');
    el.textContent = fmtClock(left);
    el.classList.toggle('warn', left <= WARN_SECONDS && left > 60);
    el.classList.toggle('crit', left <= 60);
    if (left <= 0) submitExam(true);
  }

  function renderExam() {
    var it = exam.items[exam.idx], q = it.q;
    var multi = q.pick > 1;
    var hot = isHot(q);
    $('examQCard').innerHTML =
      '<div class="qhead"><span class="qno">Câu ' + (exam.idx + 1) + ' / ' + exam.items.length + '</span>' +
      (hot ? '<span class="badge warn">Chọn cho đủ ' + q.slots.length + ' ô</span>'
           : (multi ? '<span class="badge warn">Chọn ' + q.pick + ' đáp án</span>' : '')) +
      (it.flagged ? '<span class="badge warn">Đã đánh dấu xem lại</span>' : '') +
      '</div>' +
      '<div class="qtext">' + hl(q.question) + '</div>' +
      (hot ? hotspotHtml(q, it.sel, false, false)
           : optionsHtml(q, it.order, it.sel, multi, 'ex' + exam.idx));

    if (hot) {
      Array.prototype.forEach.call($('examQCard').querySelectorAll('.hs-sel'), function (sel) {
        sel.addEventListener('change', function () {
          it.sel[parseInt(sel.getAttribute('data-slot'), 10)] = sel.value;
          renderExamNav();
        });
      });
      $('exFlag').textContent = it.flagged ? '⚑ Bỏ đánh dấu' : '⚑ Đánh dấu xem lại';
      renderExamNav();
      return;
    }

    Array.prototype.forEach.call($('examQCard').querySelectorAll('.opt input'), function (input) {
      input.addEventListener('change', function () {
        var key = input.value;
        if (multi) {
          if (input.checked) { if (it.sel.indexOf(key) === -1) it.sel.push(key); }
          else { it.sel = it.sel.filter(function (k) { return k !== key; }); }
          if (it.sel.length > q.pick) {
            var removed = it.sel.shift();
            var other = $('examQCard').querySelector('.opt input[value="' + removed + '"]');
            if (other) other.checked = false;
          }
        } else {
          it.sel = [key];
        }
        Array.prototype.forEach.call($('examQCard').querySelectorAll('.opt'), function (lab) {
          lab.classList.toggle('sel', it.sel.indexOf(lab.getAttribute('data-key')) !== -1);
        });
        renderExamNav();
      });
    });

    $('exFlag').textContent = it.flagged ? '⚑ Bỏ đánh dấu' : '⚑ Đánh dấu xem lại';
    renderExamNav();
  }

  function renderExamNav() {
    $('exNav').innerHTML = exam.items.map(function (it, i) {
      var cls = [];
      if (isAnswered(it.q, it.sel)) cls.push('answered');
      if (it.flagged) cls.push('flagged');
      if (i === exam.idx) cls.push('cur');
      return '<button class="' + cls.join(' ') + '" data-i="' + i + '">' + (i + 1) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('exNav').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        exam.idx = parseInt(b.getAttribute('data-i'), 10);
        renderExam();
      });
    });
  }

  function submitExam(auto) {
    if (!exam || exam.finished) return;
    if (!auto) {
      var unanswered = exam.items.filter(function (it) { return !isAnswered(it.q, it.sel); }).length;
      var msg = unanswered
        ? 'Còn ' + unanswered + ' câu chưa trả lời. Vẫn nộp bài?'
        : 'Nộp bài và xem kết quả?';
      if (!confirm(msg)) return;
    }
    exam.finished = true;
    clearInterval(exam.timerId);

    var timeUsed = Math.min(EXAM_SECONDS, Math.round((Date.now() - exam.startedAt) / 1000));
    var wrong = [];
    var correct = 0;
    exam.items.forEach(function (it) {
      if (isCorrectAns(it.q, it.sel)) correct++;
      else wrong.push(it);
    });
    var total = exam.items.length;
    var score = Math.round((correct / total) * 100);

    hist.exams.push({
      date: Date.now(), score: score, correct: correct, total: total,
      timeUsed: timeUsed, wrongIds: wrong.map(function (it) { return it.q.id; })
    });
    save(LS_HIST, hist);

    $('rScore').textContent = score + '%';
    $('rCorrect').textContent = correct;
    $('rWrong').textContent = wrong.length;
    $('rTime').textContent = fmtClock(timeUsed);

    /* Trên trang kết quả dùng thứ tự chữ cái GỐC của bộ đề (không phải thứ tự đã xáo),
       để chữ cái khớp với phần giải thích và trang thảo luận gốc. Nội dung đáp án luôn
       được in kèm nên không thể nhầm. */
    $('rWrongList').innerHTML = wrong.length === 0
      ? '<p class="muted">Không có câu nào sai. Rất tốt.</p>'
      : '<p class="note">Chữ cái bên dưới theo thứ tự gốc của bộ đề (khác thứ tự đã xáo lúc làm bài) để khớp với phần giải thích.</p>' +
      wrong.map(function (it) {
        var q = it.q, ans = effAnswer(q);
        var origKeys = Object.keys(q.options);
        var answered = isAnswered(q, it.sel);
        var your = isHot(q)
          ? hotAnswerText(q, it.sel)
          : (answered ? answerLabelText(q, it.sel, origKeys) : '');
        var right = isHot(q)
          ? hotAnswerText(q, null)
          : answerLabelText(q, ans, origKeys);
        return '<div class="wrongitem">' +
          '<div class="qhead"><span class="qno">Câu số ' + q.no + '</span>' +
          (isHot(q) ? '<span class="badge warn">ô sổ xuống</span>' : '') +
          (hasOverride(q) ? '<span class="badge ok">đã sửa</span>' : '') + '</div>' +
          '<div class="qtext">' + hl(q.question) + '</div>' +
          '<div class="fb bad"><b>Bạn chọn:</b> ' +
            (answered || isHot(q) ? esc(your) : '<i>không trả lời</i>') + '</div>' +
          '<div class="fb ok"><b>Đáp án đúng:</b> ' + esc(right) + '</div>' +
          explanationHtml(q) +
          '<p class="note"><a href="' + esc(q.url) + '" target="_blank" rel="noopener">Xem thảo luận gốc</a></p>' +
          '</div>';
      }).join('');

    show('scResult', 'Kết quả bài thi', false);
    renderHome();
    if (auto) alert('Đã hết 90 phút. Bài thi được nộp tự động.');
  }

  /* =====================================================================
     CHẾ ĐỘ LUYỆN TẬP
     ===================================================================== */
  var HOT_SET = 'hot';   /* giá trị đặc biệt của ô "Bộ": nhóm câu ô sổ xuống */
  var prac = { list: [], idx: 0, state: {}, filter: 'all', set: -1 };

  function practiceList() {
    /* Phạm vi gốc là ô "Bộ" (tất cả / bộ 50 câu / nhóm ô sổ xuống),
       bộ lọc áp chồng lên trên đó nên kết hợp được, ví dụ "ô sổ xuống + chưa thuộc". */
    var base;
    if (prac.set === HOT_SET) base = QUESTIONS.filter(isHot);
    else if (prac.set >= 0) base = setQuestions(prac.set);
    else base = QUESTIONS.slice();

    if (prac.filter === 'unmastered') {
      return base.filter(function (q) { return !isMastered(q); });
    }
    if (prac.filter === 'bm') {
      return base.filter(function (q) { return bookmarks.indexOf(q.id) !== -1; });
    }
    if (prac.filter === 'wrong') {
      var w = wrongIdSet();
      return base.filter(function (q) { return w[q.id]; });
    }
    if (prac.filter === 'needkey') {
      return base.filter(effNeedsKey);
    }
    return base;
  }

  function renderSetSelect() {
    var opts = ['<option value="-1">Tất cả ' + QUESTIONS.length + ' câu</option>'];
    var hotAll = QUESTIONS.filter(isHot);
    if (hotAll.length) {
      opts.push('<option value="' + HOT_SET + '">Nhóm ô sổ xuống (' + hotAll.length +
        ' câu) · thuộc ' + hotAll.filter(isMastered).length + '/' + hotAll.length + '</option>');
    }
    for (var i = 0; i < setCount(); i++) {
      var s = setStats(i);
      opts.push('<option value="' + i + '">Bộ ' + (i + 1) + ' (câu ' + s.from + '–' + s.to +
        ') · thuộc ' + s.mastered + '/' + s.total + '</option>');
    }
    $('pSet').innerHTML = opts.join('');
    $('pSet').value = String(prac.set);
  }

  function practiceLabel() {
    if (prac.set === HOT_SET) return 'Luyện tập — nhóm ô sổ xuống';
    if (prac.set >= 0) return 'Luyện tập — Bộ ' + (prac.set + 1);
    return 'Luyện tập';
  }

  function startPractice(setIndex, filter) {
    prac.set = (typeof setIndex === 'number' || setIndex === HOT_SET) ? setIndex : -1;
    prac.filter = filter || 'all';
    /* Mỗi lượt học là một lượt mới: xoá trạng thái đã trả lời của phiên trước,
       nếu không các câu sẽ bị khoá và không tính được số lần đúng liên tiếp. */
    prac.state = {};
    prac.list = practiceList();
    prac.idx = 0;
    renderSetSelect();
    $('pFilter').value = prac.filter;
    show('scPractice', practiceLabel(), false);
    renderPractice();
  }

  function pstate(q) {
    if (!prac.state[q.id]) prac.state[q.id] = { sel: blankSel(q), checked: false, editing: false };
    return prac.state[q.id];
  }

  function renderPractice() {
    var card = $('pCard');
    if (prac.list.length === 0) {
      card.innerHTML = '<p class="muted">Không có câu hỏi nào khớp bộ lọc này.</p>';
      $('pPos').textContent = '0 / 0';
      return;
    }
    if (prac.idx < 0) prac.idx = 0;
    if (prac.idx >= prac.list.length) prac.idx = prac.list.length - 1;

    var q = prac.list[prac.idx];
    var st = pstate(q);
    var ans = effAnswer(q);
    var needs = ans.length === 0;
    var multi = q.pick > 1;
    var hot = isHot(q);
    var keys = Object.keys(q.options);
    var bm = bookmarks.indexOf(q.id) !== -1;

    var html =
      '<div class="qhead">' +
      '<span class="qno">Câu ' + (prac.idx + 1) + ' / ' + prac.list.length + '</span>' +
      '<span class="muted">(câu số ' + q.no + ' trong bộ đề)</span>' +
      (hot ? '<span class="badge warn">Ô sổ xuống — chọn đủ ' + q.slots.length + ' ô</span>' : '') +
      (multi && !hot ? '<span class="badge warn">Chọn ' + q.pick + ' đáp án</span>' : '') +
      (needs ? '<span class="badge bad">chưa có đáp án chuẩn</span>' : '') +
      (isMastered(q) ? '<span class="badge ok">đã thuộc</span>'
        : (progOf(q).s > 0 ? '<span class="badge warn">đúng ' + progOf(q).s + '/' +
            MASTER_STREAK + ' lần</span>' : '')) +
      (q.fixed && !hasOverride(q) ? '<span class="badge ok">đáp án đã rà soát</span>' : '') +
      (hasOverride(q) ? '<span class="badge ok">đã sửa</span>' : '') +
      (bm ? '<span class="badge">đã đánh dấu</span>' : '') +
      '</div>' +
      '<div class="qtext">' + hl(q.question) + '</div>' +
      (hot ? hotspotHtml(q, st.sel, st.checked, st.checked)
           : optionsHtml(q, keys, st.sel, multi || needs, 'pr' + q.id));

    if ((multi || hot) && !st.checked && !needs) {
      html += '<div class="row" style="margin-top:12px"><button class="btn" id="pCheck">Kiểm tra</button></div>';
    }
    if (needs) {
      html += '<div class="fb neutral">Câu này chưa có đáp án chuẩn nên không được chấm điểm và ' +
        'không xuất hiện trong chế độ thi thật. Dùng nút bên dưới để bổ sung đáp án đúng.</div>';
    } else if (st.checked) {
      var ok = isCorrectAns(q, st.sel);
      html += '<div class="fb ' + (ok ? 'ok' : 'bad') + '"><b>' +
        (ok ? 'Chính xác.' : 'Chưa đúng.') + '</b>' +
        (hot ? (ok ? '' : ' Đáp án đúng đã được đánh dấu ở từng dòng phía trên.')
             : ' Đáp án đúng: ' + esc(answerLabelText(q, ans, keys))) + '</div>';
    }

    if (st.checked || needs) {
      html += explanationHtml(q);
      html += '<p class="note"><a href="' + esc(q.url) + '" target="_blank" rel="noopener">Xem thảo luận gốc trên ExamTopics</a></p>';
    }

    html += '<div class="row" style="margin-top:14px">' +
      '<button class="btn sec sm" id="pBm">' + (bm ? '★ Bỏ đánh dấu' : '☆ Đánh dấu') + '</button>' +
      (hot ? '' : '<button class="btn sec sm" id="pFix">Đáp án này sai — sửa lại</button>') +
      (hasOverride(q) ? '<button class="btn sec sm" id="pUndo">Hoàn tác về đáp án gốc</button>' : '') +
      (st.checked ? '<button class="btn sec sm" id="pRetry">Làm lại câu này</button>' : '') +
      '</div>';

    if (hasOverride(q) && overrides[String(q.id)].note) {
      html += '<p class="note"><b>Ghi chú của bạn:</b> ' + esc(overrides[String(q.id)].note) + '</p>';
    }

    if (st.editing) {
      var cur = hasOverride(q) ? parseLetters(overrides[String(q.id)].answer, keys) : ans;
      html += '<div class="ovr"><b>Sửa đáp án đúng</b>' +
        '<div class="muted">Chọn (các) đáp án đúng thực tế' +
        (multi ? ' — câu này cần ' + q.pick + ' đáp án' : '') + '.</div>' +
        '<div class="letters">' + keys.map(function (k) {
          return '<label><input type="checkbox" class="ovrL" value="' + k + '"' +
            (cur.indexOf(k) !== -1 ? ' checked' : '') + '><span>' + k + '</span></label>';
        }).join('') + '</div>' +
        '<textarea id="ovrNote" placeholder="Ghi chú (tùy chọn)">' +
        esc(hasOverride(q) ? (overrides[String(q.id)].note || '') : '') + '</textarea>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm" id="ovrSave">Lưu</button>' +
        '<button class="btn sec sm" id="ovrCancel">Hủy</button></div></div>';
    }

    card.innerHTML = html;
    $('pPos').textContent = 'Câu ' + (prac.idx + 1) + ' / ' + prac.list.length;
    $('pJump').max = prac.list.length;

    /* chọn đáp án */
    Array.prototype.forEach.call(card.querySelectorAll('.opt input'), function (input) {
      if (st.checked) { input.disabled = true; return; }
      input.addEventListener('change', function () {
        var key = input.value;
        if (multi || needs) {
          if (input.checked) { if (st.sel.indexOf(key) === -1) st.sel.push(key); }
          else { st.sel = st.sel.filter(function (k) { return k !== key; }); }
        } else {
          st.sel = [key];
          st.checked = true;
          recordPractice(q, st);
        }
        renderPractice();
      });
    });

    /* tô màu đúng/sai sau khi đã kiểm tra */
    if (st.checked && !needs) {
      Array.prototype.forEach.call(card.querySelectorAll('.opt'), function (lab) {
        var k = lab.getAttribute('data-key');
        lab.classList.add('locked');
        if (ans.indexOf(k) !== -1) lab.classList.add('correct');
        else if (st.sel.indexOf(k) !== -1) lab.classList.add('wrong');
      });
    }

    /* hotspot: mỗi ô sổ xuống ghi vào đúng vị trí dòng của nó */
    if (hot && !st.checked) {
      Array.prototype.forEach.call(card.querySelectorAll('.hs-sel'), function (sel) {
        sel.addEventListener('change', function () {
          st.sel[parseInt(sel.getAttribute('data-slot'), 10)] = sel.value;
        });
      });
    }

    if ($('pCheck')) $('pCheck').addEventListener('click', function () {
      if (!isAnswered(q, st.sel)) {
        alert(hot ? 'Hãy chọn đủ tất cả các ô trước khi kiểm tra.' : 'Hãy chọn đáp án trước.');
        return;
      }
      st.checked = true; recordPractice(q, st); renderPractice();
    });
    if ($('pRetry')) $('pRetry').addEventListener('click', function () {
      st.sel = blankSel(q); st.checked = false; renderPractice();
    });
    if ($('pBm')) $('pBm').addEventListener('click', function () {
      var i = bookmarks.indexOf(q.id);
      if (i === -1) bookmarks.push(q.id); else bookmarks.splice(i, 1);
      save(LS_BM, bookmarks); renderHome(); renderPractice();
    });
    if ($('pFix')) $('pFix').addEventListener('click', function () {
      st.editing = !st.editing; renderPractice();
    });
    if ($('pUndo')) $('pUndo').addEventListener('click', function () {
      if (!confirm('Hoàn tác về đáp án gốc của câu này?')) return;
      delete overrides[String(q.id)];
      save(LS_OVR, overrides);
      st.checked = false; st.sel = []; st.editing = false;
      renderHome(); renderPractice();
    });
    if ($('ovrSave')) $('ovrSave').addEventListener('click', function () {
      var picked = [];
      Array.prototype.forEach.call(card.querySelectorAll('.ovrL'), function (c) {
        if (c.checked) picked.push(c.value);
      });
      if (!picked.length) { alert('Hãy chọn ít nhất một đáp án.'); return; }
      picked.sort();
      overrides[String(q.id)] = { answer: picked.join(''), note: $('ovrNote').value.trim() };
      save(LS_OVR, overrides);
      st.editing = false; st.checked = false; st.sel = [];
      renderHome(); renderPractice();
    });
    if ($('ovrCancel')) $('ovrCancel').addEventListener('click', function () {
      st.editing = false; renderPractice();
    });
  }

  function recordPractice(q, st) {
    var ans = effAnswer(q);
    if (!ans.length) return;
    var correct = isCorrectAns(q, st.sel);
    if (!correct && hist.practiceWrong.indexOf(q.id) === -1) hist.practiceWrong.push(q.id);
    recordProgress(q, correct);   /* recordProgress đã tự lưu localStorage */
    renderSetSelect();            /* cập nhật số câu đã thuộc trong ô chọn bộ */
  }

  /* =====================================================================
     XUẤT / NHẬP DỮ LIỆU
     ===================================================================== */
  function exportData() {
    var payload = {};
    payload[LS_OVR] = overrides;
    payload[LS_BM] = bookmarks;
    payload[LS_HIST] = hist;
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    a.href = url;
    a.download = 'aif-quiz-data-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    $('ioMsg').textContent = 'Đã xuất file dữ liệu.';
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); }
      catch (e) { $('ioMsg').textContent = 'File không hợp lệ (không đọc được JSON).'; return; }
      if (!data || typeof data !== 'object') {
        $('ioMsg').textContent = 'File không hợp lệ.'; return;
      }
      if (!confirm('Nhập dữ liệu sẽ ghi đè đáp án đã sửa, dấu trang và lịch sử hiện tại. Tiếp tục?')) return;

      if (data[LS_OVR] && typeof data[LS_OVR] === 'object') {
        overrides = data[LS_OVR]; save(LS_OVR, overrides);
      }
      if (Array.isArray(data[LS_BM])) { bookmarks = data[LS_BM]; save(LS_BM, bookmarks); }
      var h = data[LS_HIST];
      if (Array.isArray(h)) h = { exams: h, practiceWrong: [] };
      if (h && typeof h === 'object') {
        hist = {
          exams: Array.isArray(h.exams) ? h.exams : [],
          practiceWrong: Array.isArray(h.practiceWrong) ? h.practiceWrong : [],
          progress: (h.progress && typeof h.progress === 'object') ? h.progress : {}
        };
        save(LS_HIST, hist);
      }
      prac.state = {};
      renderHome();
      $('ioMsg').textContent = 'Đã nhập dữ liệu thành công: ' +
        Object.keys(overrides).length + ' đáp án đã sửa, ' +
        bookmarks.length + ' dấu trang, ' + hist.exams.length + ' lần thi.';
    };
    reader.readAsText(file);
  }

  /* =====================================================================
     GẮN SỰ KIỆN
     ===================================================================== */
  $('btnExam').addEventListener('click', startExam);
  $('btnPractice').addEventListener('click', function () { startPractice(-1, 'all'); });
  $('btnSmart').addEventListener('click', function () { startPractice(-1, 'unmastered'); });
  $('btnHotspot').addEventListener('click', function () { startPractice(HOT_SET, 'all'); });
  $('btnResetProgress').addEventListener('click', function () {
    if (!confirm('Xoá toàn bộ tiến độ học (mức thuộc bài của mọi câu)? ' +
      'Đáp án đã sửa, dấu trang và lịch sử thi vẫn được giữ.')) return;
    hist.progress = {};
    save(LS_HIST, hist);
    prac.state = {};
    renderHome();
  });
  $('pSet').addEventListener('change', function () {
    var v = $('pSet').value;
    prac.set = (v === HOT_SET) ? HOT_SET : parseInt(v, 10);
    prac.list = practiceList();
    prac.idx = 0;
    $('topLabel').textContent = practiceLabel();
    renderPractice();
  });
  $('btnHome').addEventListener('click', function () {
    if (exam && !exam.finished) {
      if (!confirm('Thoát bài thi đang làm? Kết quả sẽ không được lưu.')) return;
      clearInterval(exam.timerId); exam.finished = true;
    }
    renderHome(); show('scHome', '', false);
  });
  $('exPrev').addEventListener('click', function () {
    if (exam.idx > 0) { exam.idx--; renderExam(); }
  });
  $('exNext').addEventListener('click', function () {
    if (exam.idx < exam.items.length - 1) { exam.idx++; renderExam(); }
  });
  $('exFlag').addEventListener('click', function () {
    var it = exam.items[exam.idx]; it.flagged = !it.flagged; renderExam();
  });
  $('exSubmit').addEventListener('click', function () { submitExam(false); });
  $('rHome').addEventListener('click', function () { renderHome(); show('scHome', '', false); });
  $('rAgain').addEventListener('click', startExam);
  $('pPrev').addEventListener('click', function () {
    if (prac.idx > 0) { prac.idx--; renderPractice(); window.scrollTo(0, 0); }
  });
  $('pNext').addEventListener('click', function () {
    if (prac.idx < prac.list.length - 1) { prac.idx++; renderPractice(); window.scrollTo(0, 0); }
  });
  $('pFilter').addEventListener('change', function () {
    prac.filter = $('pFilter').value;
    prac.list = practiceList();
    prac.idx = 0;
    renderPractice();
  });
  $('pGo').addEventListener('click', function () {
    var n = parseInt($('pJump').value, 10);
    if (!isNaN(n) && n >= 1 && n <= prac.list.length) {
      prac.idx = n - 1; renderPractice(); window.scrollTo(0, 0);
    }
  });
  $('pJump').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('pGo').click();
  });
  $('optHighlight').checked = highlightOn;
  $('optHighlight').addEventListener('change', function () {
    highlightOn = this.checked;
    save('aif_highlight', highlightOn);
  });
  $('btnExport').addEventListener('click', exportData);
  $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
  $('fileImport').addEventListener('change', function () {
    if (this.files && this.files[0]) importData(this.files[0]);
    this.value = '';
  });
  window.addEventListener('beforeunload', function (e) {
    if (exam && !exam.finished) { e.preventDefault(); e.returnValue = ''; }
  });

  renderHome();
})();
