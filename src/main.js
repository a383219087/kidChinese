import './style.css'
import characters from './data/characters.json'
import { pinyin } from 'pinyin-pro'
import { VoiceRecorder } from './recorder.js'
import { saveExam, listExams, getExam, blobToDataUrl } from './storage.js'

const EXAM_SIZE = 20
const PINYIN_KEY = 'kidChinese.showPinyin'
const PRACTICED_KEY = 'kidChinese.practicedByTerm'

function byTerm(term) {
  return characters.filter((c) => c.term === term)
}

function makeHomeOrder(term) {
  return shuffle(byTerm(term))
}

function loadShowPinyin() {
  try {
    return localStorage.getItem(PINYIN_KEY) === '1'
  } catch {
    return false
  }
}

function loadPracticed(term) {
  try {
    const all = JSON.parse(localStorage.getItem(PRACTICED_KEY) || '{}')
    return new Set(Array.isArray(all[term]) ? all[term] : [])
  } catch {
    return new Set()
  }
}

function savePracticed(term, set) {
  try {
    const all = JSON.parse(localStorage.getItem(PRACTICED_KEY) || '{}')
    all[term] = [...set]
    localStorage.setItem(PRACTICED_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/** Common kid/function words for sentence segmentation. */
const SEGMENT_DICT = [
  '小朋友',
  '同学们',
  '操场上',
  '教室里',
  '公园里',
  '星期六',
  '星期天',
  '一年级',
  '红领巾',
  '开满塘',
  '爸爸',
  '妈妈',
  '哥哥',
  '弟弟',
  '姐姐',
  '妹妹',
  '爷爷',
  '奶奶',
  '老师',
  '同学',
  '我们',
  '你们',
  '他们',
  '她们',
  '今天',
  '明天',
  '昨天',
  '上午',
  '下午',
  '天气',
  '一起',
  '喜欢',
  '看见',
  '认识',
  '学会',
  '上学',
  '放学',
  '回家',
  '走路',
  '跑步',
  '画画',
  '读书',
  '写字',
  '唱歌',
  '游戏',
  '公园',
  '学校',
  '教室',
  '操场',
  '小鸟',
  '小草',
  '花朵',
  '花草',
  '荷花',
  '梅花',
  '桃花',
  '菊花',
  '剪刀',
  '剪纸',
  '问好',
  '问题',
  '铅笔',
  '橡皮',
  '本子',
  '书包',
  '太阳',
  '月亮',
  '星星',
  '白云',
  '下雨',
  '下雪',
  '春天',
  '夏天',
  '秋天',
  '冬天',
  '初春',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '非常',
  '真好',
  '好看',
  '开心',
  '快乐',
  '好吃',
  '一个',
  '这个',
  '那个',
  '什么',
  '怎么',
  '可以',
  '不要',
  '没有',
  '还有',
  '已经',
  '正在',
  '许多',
  '一些',
  '自己',
  '大家',
  '因为',
  '所以',
  '但是',
  '然后',
  '如果',
  '真的',
  '好好',
  '轻轻',
  '慢慢',
  '带到',
  '带我',
  '去玩',
  '看书',
  '写字',
  '爱护',
  '保护',
  '帮助',
  '照顾',
  '休息',
  '生病',
  '找到',
  '丢失',
  '劳动',
  '功课',
  '词语',
  '故事',
  '国王',
  '马路',
  '泥土',
  '土地',
  '班级',
  '名字',
  '枯死',
  '叶子',
  '探出',
]

function stripSentencePunct(s) {
  return String(s || '').replace(/[。！？，、；：""''「」『』（）()《》\s]/g, '')
}

/** Split a sentence into clickable word chunks for 点词组句. */
function splitSentenceParts(sentence, hintWords = []) {
  const text = stripSentencePunct(sentence)
  if (!text) return []
  const dict = [...new Set([...(hintWords || []), ...SEGMENT_DICT])]
    .filter((w) => w && w.length >= 2 && [...w].every((c) => isHan(c)))
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))
  const known = new Set(dict)
  const chars = [...text]
  const parts = []
  let i = 0
  while (i < chars.length) {
    let matched = null
    for (const w of dict) {
      const wChars = [...w]
      if (i + wChars.length > chars.length) continue
      if (chars.slice(i, i + wChars.length).join('') === w) {
        matched = w
        break
      }
    }
    if (matched) {
      parts.push(matched)
      i += [...matched].length
      continue
    }
    // Only glue 2 leftover chars when that bigram is a known word
    if (i + 1 < chars.length) {
      const two = chars[i] + chars[i + 1]
      if (known.has(two)) {
        parts.push(two)
        i += 2
        continue
      }
    }
    parts.push(chars[i])
    i += 1
  }
  // Merge lonely singles into neighbors so chips stay kid-friendly (2–4 parts ideal)
  const merged = []
  for (const p of parts) {
    if (
      p.length === 1 &&
      merged.length &&
      merged[merged.length - 1].length === 1 &&
      merged[merged.length - 1].length + 1 <= 2
    ) {
      merged[merged.length - 1] += p
    } else {
      merged.push(p)
    }
  }
  if (merged.length < 2 && text.length >= 2) {
    const mid = Math.ceil(chars.length / 2)
    return [chars.slice(0, mid).join(''), chars.slice(mid).join('')]
  }
  // If too many tiny chips, pair adjacent singles/short pieces
  if (merged.length > 6) {
    const compact = []
    for (let k = 0; k < merged.length; k++) {
      if (k + 1 < merged.length && merged[k].length + merged[k + 1].length <= 3) {
        compact.push(merged[k] + merged[k + 1])
        k += 1
      } else {
        compact.push(merged[k])
      }
    }
    return compact.length >= 2 ? compact : merged
  }
  return merged
}

function makeAssemblyState(item) {
  const sentence = (item?.sentences || [])[0] || ''
  const answer = splitSentenceParts(sentence, item?.words || [])
  const pool = shuffle(answer.map((text, i) => ({ id: `${i}-${text}`, text })))
  return {
    sentence,
    answer,
    pool,
    picked: [],
    status: 'play', // play | correct | wrong
  }
}

const state = {
  view: 'home', // home | exam | history | historyDetail
  homeTerm: '一上',
  homeOrder: makeHomeOrder('一上'),
  homeIndex: 0,
  showPinyin: loadShowPinyin(),
  examTerm: null, // null = pick 一上/一下 first
  examItems: [],
  examIndex: 0,
  examAudios: {}, // index -> dataUrl
  examAssembly: null, // 点词组句 state for current exam item
  historyId: null,
  historyItems: [],
  historyIndex: 0,
  recording: false,
}

const recorder = new VoiceRecorder()

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function toast(msg) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toast._t)
  toast._t = setTimeout(() => el.classList.remove('show'), 1800)
}

function currentHomeChar() {
  return state.homeOrder[state.homeIndex]
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isHan(ch) {
  return ch >= '\u4e00' && ch <= '\u9fff'
}

function rubyOf(ch, py) {
  if (!py || !isHan(ch)) return escapeHtml(ch)
  return `<ruby class="py-ruby">${escapeHtml(ch)}<rp>(</rp><rt>${escapeHtml(py)}</rt><rp>)</rp></ruby>`
}

/** Single-character pinyin: show all common readings for polyphones (e.g. 长 → cháng/zhǎng). */
function withPinyinChar(ch, enabled) {
  if (!enabled) return escapeHtml(ch)
  const readings = pinyin(ch, { toneType: 'symbol', type: 'array', multiple: true })
  const py = Array.isArray(readings) ? [...new Set(readings)].join('/') : String(readings || '')
  return rubyOf(ch, py)
}

/**
 * Phrase/sentence pinyin: context-aware, so 长大→zhǎng、长度→cháng.
 */
function withPinyin(text, enabled) {
  const raw = String(text ?? '')
  if (!enabled) return escapeHtml(raw)
  const chars = [...raw]
  const pys = pinyin(raw, { toneType: 'symbol', type: 'array' })
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const py = pys[i]
    if (isHan(ch) && py && py !== ch) {
      out += rubyOf(ch, py)
    } else {
      out += escapeHtml(ch)
    }
  }
  return out
}

function renderAssemblyBlock(assembly, { showPinyin = false } = {}) {
  if (!assembly?.answer?.length) {
    return `<div class="section-block"><h3>造句</h3><div class="empty-inline">暂无造句</div></div>`
  }
  const pickedHtml = assembly.picked.length
    ? assembly.picked
        .map(
          (p, idx) =>
            `<button type="button" class="chip chip-pick assembled" data-action="assemble-unpick" data-idx="${idx}">${withPinyin(p.text, showPinyin)}</button>`
        )
        .join('')
    : '<span class="assemble-placeholder">按顺序点选词语组成句子</span>'
  const poolHtml = assembly.pool.length
    ? assembly.pool
        .map(
          (p) =>
            `<button type="button" class="chip chip-pick" data-action="assemble-pick" data-id="${escapeHtml(p.id)}">${withPinyin(p.text, showPinyin)}</button>`
        )
        .join('')
    : ''
  let feedback = ''
  if (assembly.status === 'correct') {
    feedback = `<div class="assemble-feedback ok">组对了！${withPinyin(assembly.sentence, showPinyin)}</div>`
  } else if (assembly.status === 'wrong') {
    feedback = `<div class="assemble-feedback bad">再试一次，可以点上面的词撤回</div>`
  }
  return `
    <div class="section-block assemble-block">
      <h3>造句 · 点词组句</h3>
      <div class="assemble-board" aria-label="已选词语">${pickedHtml}</div>
      <div class="assemble-pool chips" aria-label="待选词语">${poolHtml}</div>
      <div class="assemble-actions">
        <button type="button" class="btn ghost small" data-action="assemble-reset">重来</button>
        <button type="button" class="btn small" data-action="assemble-check" ${assembly.picked.length !== assembly.answer.length ? 'disabled' : ''}>检查</button>
      </div>
      ${feedback}
    </div>
  `
}

function renderCharCard(item, { showPinyin = false, assembly = null } = {}) {
  const words = (item.words || []).slice(0, 5)
  const sentences = (item.sentences || []).slice(0, 3)
  const glyph = showPinyin
    ? `<div class="char-glyph char-glyph-py" aria-label="汉字">${withPinyinChar(item.char, true)}</div>`
    : `<div class="char-glyph" aria-label="汉字">${escapeHtml(item.char)}</div>`
  const sentenceBlock = assembly
    ? renderAssemblyBlock(assembly, { showPinyin })
    : sentences.length
      ? `<div class="section-block">
        <h3>造句</h3>
        <div class="sentences">
          ${sentences.map((s) => `<div class="sentence">${withPinyin(s, showPinyin)}</div>`).join('')}
        </div>
      </div>`
      : ''
  return `
    <div class="char-stage ${showPinyin ? 'show-pinyin' : ''}">
      ${glyph}
      <div class="section-block">
        <h3>组词</h3>
        <div class="chips">
          ${
            words.map((w) => `<span class="chip">${withPinyin(w, showPinyin)}</span>`).join('') ||
            '<span class="chip">暂无</span>'
          }
        </div>
      </div>
      ${sentenceBlock}
    </div>
  `
}

function shell(content) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>认字乐园</h1>
          <p class="brand-sub">一年级识字练习</p>
        </div>
        <nav class="nav">
          <button class="nav-btn ${state.view === 'home' ? 'active' : ''}" data-nav="home">主页</button>
          <button class="nav-btn ${state.view === 'exam' ? 'active' : ''}" data-nav="exam">练习</button>
          <button class="nav-btn ${state.view === 'history' || state.view === 'historyDetail' ? 'active' : ''}" data-nav="history">历史记录</button>
        </nav>
      </aside>
      <main class="main">${content}</main>
    </div>
    <div id="toast" class="toast" role="status"></div>
  `
}

function renderHome() {
  const item = currentHomeChar()
  const total = state.homeOrder.length
  const html = `
    <section class="panel">
      <div class="panel-head home-head">
        <div class="head-left">
          <h2>主页认字</h2>
          <span class="meta">${total ? state.homeIndex + 1 : 0}/${total}</span>
        </div>
        <div class="home-toolbar">
          <div class="term-tabs" role="tablist" aria-label="册次">
            <button type="button" class="term-tab ${state.homeTerm === '一上' ? 'active' : ''}" data-action="home-term" data-term="一上" role="tab" aria-selected="${state.homeTerm === '一上'}">一上</button>
            <button type="button" class="term-tab ${state.homeTerm === '一下' ? 'active' : ''}" data-action="home-term" data-term="一下" role="tab" aria-selected="${state.homeTerm === '一下'}">一下</button>
          </div>
          <label class="pinyin-switch">
            <input type="checkbox" data-action="toggle-pinyin" ${state.showPinyin ? 'checked' : ''} />
            <span class="switch-ui" aria-hidden="true"></span>
            <span>拼音</span>
          </label>
        </div>
      </div>
      ${item ? renderCharCard(item, { showPinyin: state.showPinyin }) : '<div class="empty">该册暂无汉字</div>'}
      <div class="pager">
        <button class="btn ghost" data-action="home-prev" ${state.homeIndex === 0 || !total ? 'disabled' : ''}>上一个</button>
        <button class="btn" data-action="home-next" ${state.homeIndex >= total - 1 || !total ? 'disabled' : ''}>下一个</button>
      </div>
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
}

function remainingForTerm(term) {
  const pool = byTerm(term)
  const practiced = loadPracticed(term)
  const left = pool.filter((c) => !practiced.has(c.char))
  return { pool, practiced, left }
}

function ensureExamAssembly() {
  const item = state.examItems[state.examIndex]
  if (!item) {
    state.examAssembly = null
    return
  }
  if (!state.examAssembly || state.examAssembly._char !== item.char) {
    state.examAssembly = { ...makeAssemblyState(item), _char: item.char }
  }
}

function startExam(term) {
  const { pool, left } = remainingForTerm(term)
  let candidates = left
  if (!candidates.length) {
    // 本册字都练过了，重新洗牌开始新一轮
    savePracticed(term, new Set())
    candidates = pool
    toast('本册字已全部练过，开始新一轮')
  }
  state.examTerm = term
  state.examItems = shuffle(candidates).slice(0, Math.min(EXAM_SIZE, candidates.length))
  state.examIndex = 0
  state.examAudios = {}
  state.examAssembly = null
  ensureExamAssembly()
}

async function finishExam() {
  if (state.recording) {
    const blob = await recorder.stop()
    state.recording = false
    if (blob) {
      state.examAudios[state.examIndex] = await blobToDataUrl(blob)
    }
  }
  const id = `exam_${Date.now()}`
  const termLabel = state.examTerm || ''
  const exam = {
    id,
    createdAt: Date.now(),
    term: state.examTerm,
    title: `练习${termLabel ? `·${termLabel}` : ''} ${new Date().toLocaleString('zh-CN')}`,
    items: state.examItems.map((item, i) => ({
      char: item.char,
      words: item.words,
      sentences: item.sentences,
      audio: state.examAudios[i] || null,
    })),
  }
  await saveExam(exam)

  // 记录本轮练过的字；若本册已全部练完，下次会自动重新随机
  if (state.examTerm) {
    const practiced = loadPracticed(state.examTerm)
    for (const item of state.examItems) practiced.add(item.char)
    const poolSize = byTerm(state.examTerm).length
    if (practiced.size >= poolSize) {
      savePracticed(state.examTerm, new Set())
    } else {
      savePracticed(state.examTerm, practiced)
    }
  }

  state.examTerm = null
  state.examItems = []
  state.examIndex = 0
  state.examAudios = {}
  state.examAssembly = null
  toast('练习已保存到历史记录')
  state.view = 'history'
  render()
}

function renderExamPick() {
  const shang = remainingForTerm('一上')
  const xia = remainingForTerm('一下')
  const tipLeft = (info) => {
    if (!info.practiced.size) return `共 ${info.pool.length} 字 · 新一轮`
    if (!info.left.length) return `共 ${info.pool.length} 字 · 已练完，将重新随机`
    return `还剩 ${info.left.length}/${info.pool.length} 字未练`
  }
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>练习</h2>
        <div class="meta">每次最多 ${EXAM_SIZE} 字 · 点词组句</div>
      </div>
      <div class="exam-pick">
        <p class="exam-pick-tip">请先选择要练习的册次（已练过的字本轮不会再出现）</p>
        <div class="exam-pick-cards">
          <button type="button" class="exam-pick-card" data-action="exam-start" data-term="一上">
            <strong>一上</strong>
            <span>${tipLeft(shang)}</span>
          </button>
          <button type="button" class="exam-pick-card" data-action="exam-start" data-term="一下">
            <strong>一下</strong>
            <span>${tipLeft(xia)}</span>
          </button>
        </div>
      </div>
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
}

function renderExam() {
  if (!state.examTerm || !state.examItems.length) {
    renderExamPick()
    return
  }
  ensureExamAssembly()
  const item = state.examItems[state.examIndex]
  const hasAudio = Boolean(state.examAudios[state.examIndex])
  const isLast = state.examIndex >= state.examItems.length - 1
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>练习 · ${state.examTerm}</h2>
        <div class="meta">${state.examIndex + 1}/${state.examItems.length}</div>
      </div>
      ${renderCharCard(item, { assembly: state.examAssembly })}
      <div class="exam-footer">
        <div class="rec-actions">
          ${state.recording ? '<span class="rec-dot" aria-hidden="true"></span><span class="meta">录音中</span>' : ''}
          ${
            state.recording
              ? `<button type="button" class="btn text danger" data-action="exam-stop-rec">停止录音</button>`
              : `<button type="button" class="btn text accent" data-action="exam-start-rec">开始录音</button>`
          }
          ${
            hasAudio && !state.recording
              ? `<button type="button" class="btn text" data-action="exam-play-rec">播放录音</button>`
              : ''
          }
        </div>
        <div class="nav-actions">
          <button class="btn ghost" data-action="exam-prev" ${state.examIndex === 0 || state.recording ? 'disabled' : ''}>上一个</button>
          ${
            isLast
              ? `<button class="btn" data-action="exam-finish" ${state.recording ? 'disabled' : ''}>完成练习</button>`
              : `<button class="btn" data-action="exam-next" ${state.recording ? 'disabled' : ''}>下一个</button>`
          }
        </div>
      </div>
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
}

async function renderHistory() {
  const exams = await listExams()
  const list = exams.length
    ? `<div class="history-list">
        ${exams
          .map(
            (e) => `
          <button class="history-item" data-action="open-history" data-id="${e.id}">
            <div>
              <strong>${e.title || '练习记录'}</strong>
              <span class="meta">${e.items?.length || 0} 个字 · ${new Date(e.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <span class="meta">查看</span>
          </button>`
          )
          .join('')}
      </div>`
    : `<div class="empty">还没有练习记录，先去「练习」完成一次吧。</div>`

  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>历史记录</h2>
        <div class="meta">共 ${exams.length} 次</div>
      </div>
      ${list}
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
}

function renderHistoryDetail() {
  const items = state.historyItems
  const item = items[state.historyIndex]
  if (!item) {
    state.view = 'history'
    render()
    return
  }
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>练习详情</h2>
        <div class="meta">
          <button class="btn ghost" data-action="back-history">返回列表</button>
          <span>${state.historyIndex + 1} / ${items.length}</span>
        </div>
      </div>
      ${renderCharCard(item)}
      <div class="exam-footer">
        <div class="rec-actions">
          <button type="button" class="btn text accent" data-action="history-play" ${item.audio ? '' : 'disabled'}>
            ${item.audio ? '播放录音' : '无录音'}
          </button>
        </div>
        <div class="nav-actions">
          <button class="btn ghost" data-action="history-prev" ${state.historyIndex === 0 ? 'disabled' : ''}>上一个</button>
          <button class="btn" data-action="history-next" ${state.historyIndex >= items.length - 1 ? 'disabled' : ''}>下一个</button>
        </div>
      </div>
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
}

function bindCommon() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (state.recording) {
        await recorder.stop()
        state.recording = false
      }
      const next = btn.dataset.nav
      if (next === 'exam') {
        state.examTerm = null
        state.examItems = []
        state.examIndex = 0
        state.examAudios = {}
        state.examAssembly = null
      }
      state.view = next
      render()
    })
  })

  document.querySelectorAll('[data-action]').forEach((el) => {
    const eventName = el.matches('input[type="checkbox"]') ? 'change' : 'click'
    el.addEventListener(eventName, onAction)
  })
}

async function onAction(e) {
  const action = e.currentTarget.dataset.action
  switch (action) {
    case 'home-term': {
      const term = e.currentTarget.dataset.term
      if (!term || term === state.homeTerm) break
      state.homeTerm = term
      state.homeOrder = makeHomeOrder(term)
      state.homeIndex = 0
      renderHome()
      break
    }
    case 'toggle-pinyin': {
      state.showPinyin = Boolean(e.currentTarget.checked)
      try {
        localStorage.setItem(PINYIN_KEY, state.showPinyin ? '1' : '0')
      } catch {
        /* ignore */
      }
      renderHome()
      break
    }
    case 'home-prev':
      if (state.homeIndex > 0) state.homeIndex -= 1
      renderHome()
      break
    case 'home-next':
      if (state.homeIndex < state.homeOrder.length - 1) state.homeIndex += 1
      renderHome()
      break
    case 'exam-start': {
      const term = e.currentTarget.dataset.term
      if (term !== '一上' && term !== '一下') break
      startExam(term)
      renderExam()
      break
    }
    case 'exam-prev':
      if (state.examIndex > 0) {
        state.examIndex -= 1
        state.examAssembly = null
      }
      renderExam()
      break
    case 'exam-next':
      if (state.examIndex < state.examItems.length - 1) {
        state.examIndex += 1
        state.examAssembly = null
      }
      renderExam()
      break
    case 'exam-finish':
      await finishExam()
      break
    case 'assemble-pick': {
      if (!state.examAssembly || state.examAssembly.status === 'correct') break
      const id = e.currentTarget.dataset.id
      const idx = state.examAssembly.pool.findIndex((p) => p.id === id)
      if (idx < 0) break
      const [piece] = state.examAssembly.pool.splice(idx, 1)
      state.examAssembly.picked.push(piece)
      state.examAssembly.status = 'play'
      // 选满后自动检查
      if (state.examAssembly.picked.length === state.examAssembly.answer.length) {
        const ok = state.examAssembly.picked.every(
          (p, i) => p.text === state.examAssembly.answer[i]
        )
        state.examAssembly.status = ok ? 'correct' : 'wrong'
        if (ok) toast('组对了！')
      }
      renderExam()
      break
    }
    case 'assemble-unpick': {
      if (!state.examAssembly || state.examAssembly.status === 'correct') break
      const idx = Number(e.currentTarget.dataset.idx)
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.examAssembly.picked.length) break
      const [piece] = state.examAssembly.picked.splice(idx, 1)
      state.examAssembly.pool.push(piece)
      state.examAssembly.status = 'play'
      renderExam()
      break
    }
    case 'assemble-reset': {
      if (!state.examAssembly) break
      const item = state.examItems[state.examIndex]
      state.examAssembly = { ...makeAssemblyState(item), _char: item.char }
      renderExam()
      break
    }
    case 'assemble-check': {
      if (!state.examAssembly) break
      const ok =
        state.examAssembly.picked.length === state.examAssembly.answer.length &&
        state.examAssembly.picked.every((p, i) => p.text === state.examAssembly.answer[i])
      state.examAssembly.status = ok ? 'correct' : 'wrong'
      toast(ok ? '组对了！' : '还不对，再试试')
      renderExam()
      break
    }
    case 'exam-start-rec':
      try {
        await recorder.start()
        state.recording = true
        renderExam()
      } catch (err) {
        console.error(err)
        toast('无法开始录音，请检查麦克风权限')
      }
      break
    case 'exam-stop-rec': {
      const blob = await recorder.stop()
      state.recording = false
      if (blob) {
        state.examAudios[state.examIndex] = await blobToDataUrl(blob)
      }
      renderExam()
      break
    }
    case 'exam-play-rec': {
      const url = state.examAudios[state.examIndex]
      if (url) new Audio(url).play()
      break
    }
    case 'open-history': {
      const id = e.currentTarget.dataset.id
      const exam = await getExam(id)
      if (!exam) {
        toast('记录不存在')
        return
      }
      state.historyId = id
      state.historyItems = exam.items || []
      state.historyIndex = 0
      state.view = 'historyDetail'
      render()
      break
    }
    case 'back-history':
      state.view = 'history'
      render()
      break
    case 'history-prev':
      if (state.historyIndex > 0) state.historyIndex -= 1
      renderHistoryDetail()
      break
    case 'history-next':
      if (state.historyIndex < state.historyItems.length - 1) state.historyIndex += 1
      renderHistoryDetail()
      break
    case 'history-play': {
      const audio = state.historyItems[state.historyIndex]?.audio
      if (audio) new Audio(audio).play()
      break
    }
    default:
      break
  }
}

function render() {
  if (state.view === 'home') renderHome()
  else if (state.view === 'exam') renderExam()
  else if (state.view === 'history') renderHistory()
  else if (state.view === 'historyDetail') renderHistoryDetail()
}

render()
