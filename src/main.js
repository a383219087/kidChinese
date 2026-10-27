import './style.css'
import characters from './data/characters.json'
import { VoiceRecorder } from './recorder.js'
import { saveExam, listExams, getExam, blobToDataUrl } from './storage.js'

const EXAM_SIZE = 20
const state = {
  view: 'home', // home | exam | history | historyDetail
  homeOrder: shuffle([...characters]),
  homeIndex: 0,
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

function renderCharCard(item) {
  const words = (item.words || []).slice(0, 5)
  const sentences = (item.sentences || []).slice(0, 3)
  return `
    <div class="char-stage">
      <div class="char-glyph" aria-label="汉字">${item.char}</div>
      <div class="section-block">
        <h3>组词</h3>
        <div class="chips">
          ${words.map((w) => `<span class="chip">${w}</span>`).join('') || '<span class="chip">暂无</span>'}
        </div>
      </div>
      <div class="section-block">
        <h3>造句</h3>
        <div class="sentences">
          ${sentences.map((s) => `<div class="sentence">${s}</div>`).join('') || '<div class="sentence">暂无</div>'}
        </div>
      </div>
    </div>
  `
}

function shell(content) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>认字乐园</h1>
          <p>一年级识字练习</p>
        </div>
        <nav class="nav">
          <button class="nav-btn ${state.view === 'home' ? 'active' : ''}" data-nav="home">主页</button>
          <button class="nav-btn ${state.view === 'exam' ? 'active' : ''}" data-nav="exam">考试</button>
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
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>主页认字</h2>
        <div class="meta">${state.homeIndex + 1} / ${state.homeOrder.length}</div>
      </div>
      ${renderCharCard(item)}
      <div class="pager">
        <button class="btn ghost" data-action="home-prev" ${state.homeIndex === 0 ? 'disabled' : ''}>上一个</button>
        <button class="btn" data-action="home-next" ${state.homeIndex >= state.homeOrder.length - 1 ? 'disabled' : ''}>下一个</button>
      </div>
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
}

function ensureExam() {
  if (!state.examItems.length) {
    state.examItems = shuffle(characters).slice(0, Math.min(EXAM_SIZE, characters.length))
    state.examIndex = 0
    state.examAudios = {}
  }
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
  const exam = {
    id,
    createdAt: Date.now(),
    title: `考试 ${new Date().toLocaleString('zh-CN')}`,
    items: state.examItems.map((item, i) => ({
      char: item.char,
      words: item.words,
      sentences: item.sentences,
      audio: state.examAudios[i] || null,
    })),
  }
  await saveExam(exam)
  state.examItems = []
  state.examIndex = 0
  state.examAudios = {}
  toast('考试已保存到历史记录')
  state.view = 'history'
  render()
}

function renderExam() {
  ensureExam()
  const item = state.examItems[state.examIndex]
  const hasAudio = Boolean(state.examAudios[state.examIndex])
  const isLast = state.examIndex >= state.examItems.length - 1
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>考试</h2>
        <div class="meta">第 ${state.examIndex + 1} / ${state.examItems.length} 题 · 不评分</div>
      </div>
      ${renderCharCard(item)}
      <div class="recorder-bar">
        ${state.recording ? '<span class="rec-dot" aria-hidden="true"></span>' : ''}
        <span class="meta">${state.recording ? '正在录音…' : hasAudio ? '已录音（可重录）' : '请朗读并录音'}</span>
        ${
          state.recording
            ? `<button class="btn danger" data-action="exam-stop-rec">停止录音</button>`
            : `<button class="btn accent" data-action="exam-start-rec">开始录音</button>`
        }
        ${hasAudio && !state.recording ? `<button class="btn ghost" data-action="exam-play-rec">试听</button>` : ''}
      </div>
      <div class="pager">
        <button class="btn ghost" data-action="exam-prev" ${state.examIndex === 0 || state.recording ? 'disabled' : ''}>上一个</button>
        ${
          isLast
            ? `<button class="btn" data-action="exam-finish" ${state.recording ? 'disabled' : ''}>完成考试</button>`
            : `<button class="btn" data-action="exam-next" ${state.recording ? 'disabled' : ''}>下一个</button>`
        }
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
              <strong>${e.title || '考试记录'}</strong>
              <span class="meta">${e.items?.length || 0} 个字 · ${new Date(e.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <span class="meta">查看</span>
          </button>`
          )
          .join('')}
      </div>`
    : `<div class="empty">还没有考试记录，先去「考试」完成一次吧。</div>`

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
        <h2>考试详情</h2>
        <div class="meta">
          <button class="btn ghost" data-action="back-history">返回列表</button>
          <span>${state.historyIndex + 1} / ${items.length}</span>
        </div>
      </div>
      ${renderCharCard(item)}
      <div class="recorder-bar">
        <button class="btn accent" data-action="history-play" ${item.audio ? '' : 'disabled'}>
          ${item.audio ? '播放录音' : '无录音'}
        </button>
      </div>
      <div class="pager">
        <button class="btn ghost" data-action="history-prev" ${state.historyIndex === 0 ? 'disabled' : ''}>上一个</button>
        <button class="btn" data-action="history-next" ${state.historyIndex >= items.length - 1 ? 'disabled' : ''}>下一个</button>
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
        state.examItems = []
        state.examIndex = 0
        state.examAudios = {}
      }
      state.view = next
      render()
    })
  })

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', onAction)
  })
}

async function onAction(e) {
  const action = e.currentTarget.dataset.action
  switch (action) {
    case 'home-prev':
      if (state.homeIndex > 0) state.homeIndex -= 1
      renderHome()
      break
    case 'home-next':
      if (state.homeIndex < state.homeOrder.length - 1) state.homeIndex += 1
      renderHome()
      break
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
