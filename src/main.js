import './style.css'
import characters from './data/characters.json'
import { pinyin } from 'pinyin-pro'
import { VoiceRecorder } from './recorder.js'
import { saveExam, listExams, getExam, blobToDataUrl } from './storage.js'

const EXAM_SIZE = 20
const PINYIN_KEY = 'kidChinese.showPinyin'

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

function renderCharCard(item, { showPinyin = false } = {}) {
  const words = (item.words || []).slice(0, 5)
  const sentences = (item.sentences || []).slice(0, 3)
  const glyph = showPinyin
    ? `<div class="char-glyph char-glyph-py" aria-label="汉字">${withPinyinChar(item.char, true)}</div>`
    : `<div class="char-glyph" aria-label="汉字">${escapeHtml(item.char)}</div>`
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
      ${
        sentences.length
          ? `<div class="section-block">
        <h3>造句</h3>
        <div class="sentences">
          ${sentences.map((s) => `<div class="sentence">${withPinyin(s, showPinyin)}</div>`).join('')}
        </div>
      </div>`
          : ''
      }
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

function startExam(term) {
  const pool = byTerm(term)
  state.examTerm = term
  state.examItems = shuffle(pool).slice(0, Math.min(EXAM_SIZE, pool.length))
  state.examIndex = 0
  state.examAudios = {}
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
  state.examTerm = null
  state.examItems = []
  state.examIndex = 0
  state.examAudios = {}
  toast('练习已保存到历史记录')
  state.view = 'history'
  render()
}

function renderExamPick() {
  const countShang = byTerm('一上').length
  const countXia = byTerm('一下').length
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>练习</h2>
        <div class="meta">随机 ${EXAM_SIZE} 个字 · 不评分</div>
      </div>
      <div class="exam-pick">
        <p class="exam-pick-tip">请先选择要练习的册次</p>
        <div class="exam-pick-cards">
          <button type="button" class="exam-pick-card" data-action="exam-start" data-term="一上">
            <strong>一上</strong>
            <span>共 ${countShang} 字</span>
          </button>
          <button type="button" class="exam-pick-card" data-action="exam-start" data-term="一下">
            <strong>一下</strong>
            <span>共 ${countXia} 字</span>
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
  const item = state.examItems[state.examIndex]
  const hasAudio = Boolean(state.examAudios[state.examIndex])
  const isLast = state.examIndex >= state.examItems.length - 1
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>练习 · ${state.examTerm}</h2>
        <div class="meta">${state.examIndex + 1}/${state.examItems.length}</div>
      </div>
      ${renderCharCard(item)}
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
      if (state.examIndex > 0) state.examIndex -= 1
      renderExam()
      break
    case 'exam-next':
      if (state.examIndex < state.examItems.length - 1) state.examIndex += 1
      renderExam()
      break
    case 'exam-finish':
      await finishExam()
      break
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
