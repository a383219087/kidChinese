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

/**
 * Lexicon for 点词组句：按词语（主/谓/宾/定/状/补）切分，禁止乱拼「吃苹|果」。
 * Includes fixed kid phrases + every 组词 from the character bank.
 */
const SEGMENT_DICT = [
  // 人物 / 称谓（主语常见）
  '小朋友',
  '同学们',
  '爸爸',
  '妈妈',
  '哥哥',
  '弟弟',
  '姐姐',
  '妹妹',
  '爷爷',
  '奶奶',
  '叔叔',
  '老师',
  '同学',
  '我们',
  '你们',
  '他们',
  '她们',
  '它们',
  '大家',
  '自己',
  '表弟',
  '表哥',
  '二哥',
  '马儿',
  '鱼儿',
  '鸟儿',
  '花儿',
  '草地上',
  '水里',
  '天上',
  '蓝天',
  '放下',
  '飞上',
  // 时间 / 处所（状语常见）
  '今天',
  '明天',
  '昨天',
  '上午',
  '下午',
  '晚上',
  '中午',
  '早上',
  '星期六',
  '星期天',
  '一年级',
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
  '操场上',
  '教室里',
  '公园里',
  '学校里',
  '家里',
  '门口',
  '外面',
  '里面',
  '前面',
  '后面',
  '左边',
  '右边',
  // 常用动词短语（谓语）
  '喜欢',
  '最爱',
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
  '看书',
  '听话',
  '问好',
  '找到',
  '丢失',
  '爱护',
  '保护',
  '帮助',
  '照顾',
  '休息',
  '生病',
  '打开',
  '起床',
  '睡觉',
  '吃饭',
  '喝水',
  '洗手',
  '刷牙',
  '打球',
  '踢球',
  '跳绳',
  '游泳',
  '一起',
  // 名词（宾语 / 中心语）
  '苹果',
  '香蕉',
  '西瓜',
  '桃子',
  '橘子',
  '葡萄',
  '书包',
  '铅笔',
  '橡皮',
  '本子',
  '尺子',
  '作业',
  '故事',
  '词语',
  '句子',
  '公园',
  '学校',
  '教室',
  '操场',
  '马路',
  '太阳',
  '月亮',
  '星星',
  '白云',
  '天气',
  '小鸟',
  '小草',
  '小鱼',
  '小狗',
  '小猫',
  '兔子',
  '鸭子',
  '花朵',
  '花草',
  '荷花',
  '梅花',
  '桃花',
  '菊花',
  '树叶',
  '叶子',
  '剪刀',
  '剪纸',
  '问题',
  '名字',
  '国王',
  '泥土',
  '土地',
  '班级',
  '红领巾',
  '开满塘',
  '一半',
  '同岁',
  // 修饰 / 关联（定状补）
  '非常',
  '真好',
  '好看',
  '好听',
  '开心',
  '快乐',
  '好吃',
  '可爱',
  '一个',
  '这个',
  '那个',
  '什么',
  '怎么',
  '怎样',
  '可以',
  '不要',
  '没有',
  '还有',
  '已经',
  '正在',
  '许多',
  '一些',
  '因为',
  '所以',
  '但是',
  '然后',
  '如果',
  '真的',
  '好好',
  '轻轻',
  '慢慢',
  '下雨',
  '下雪',
  '劳动',
]

/** All 组词 from data — used as segmentation lexicon. */
const BANK_WORDS = (() => {
  const set = new Set()
  for (const item of characters) {
    for (const w of item.words || []) {
      if (typeof w === 'string' && w.length >= 2 && w.length <= 4) set.add(w)
    }
  }
  return [...set]
})()

/** Single-char verbs / prep / particles / adverbs kept as their own chips (谓/介/助/状). */
const KEEP_SINGLE = new Set([
  ...'吃喝看听说读写走跑跳飞来去有是在会能想要爱给打坐站穿戴拿放开关笑哭叫唱画数',
  ...'把被让从向对跟同和与用替请教帮送带进出到过',
  ...'很最都也又再才就正刚好不没太真更还',
  ...'的地得了着过们吗呢吧啊呀',
])

function stripSentencePunct(s) {
  return String(s || '').replace(/[。！？，、；：""''「」『』（）()《》\s]/g, '')
}

function buildSegmentLexicon(hintWords = []) {
  return [...new Set([...(hintWords || []), ...SEGMENT_DICT, ...BANK_WORDS])]
    .filter((w) => typeof w === 'string' && w.length >= 2 && w.length <= 4)
    .filter((w) => [...w].every((c) => isHan(c)))
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'))
}

/**
 * Forward maximum matching by real words (主谓宾定状补单位).
 * Never invents fake bigrams like「吃苹」.
 */
function splitSentenceParts(sentence, hintWords = []) {
  const text = stripSentencePunct(sentence)
  if (!text) return []
  const dict = buildSegmentLexicon(hintWords)
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

    // Prefer: single-char 谓/状 + following known noun/object
    // e.g. 吃 + 苹果 → keep「吃」separate when next is a lexicon word
    if (!matched && KEEP_SINGLE.has(chars[i])) {
      let nextWord = null
      for (const w of dict) {
        const wChars = [...w]
        if (i + 1 + wChars.length > chars.length) continue
        if (chars.slice(i + 1, i + 1 + wChars.length).join('') === w) {
          nextWord = w
          break
        }
      }
      if (nextWord) {
        parts.push(chars[i])
        i += 1
        continue
      }
    }

    if (matched) {
      // If match starts with a KEEP_SINGLE verb and remainder is also a known word,
      // split 谓 + 宾: e.g. avoid swallowing 吃进错误词；对「最爱」这类整词保留
      const first = matched[0]
      const rest = matched.slice(1)
      if (
        matched.length >= 3 &&
        KEEP_SINGLE.has(first) &&
        known.has(rest) &&
        !KEEP_SINGLE.has(matched[1]) // 最爱: 最 is KEEP_SINGLE — handled below
      ) {
        parts.push(first, rest)
        i += [...matched].length
        continue
      }
      parts.push(matched)
      i += [...matched].length
      continue
    }

    parts.push(chars[i])
    i += 1
  }

  // Only merge adjacent singles when the result is a real lexicon word
  const merged = []
  for (let k = 0; k < parts.length; k++) {
    const cur = parts[k]
    if (cur.length === 1 && k + 1 < parts.length && parts[k + 1].length === 1) {
      const two = cur + parts[k + 1]
      if (known.has(two)) {
        merged.push(two)
        k += 1
        continue
      }
    }
    merged.push(cur)
  }

  if (merged.length < 2 && text.length >= 2) {
    // Last resort: cut before a trailing known word if possible
    for (const w of dict) {
      if (text.endsWith(w) && text.length > w.length) {
        return [text.slice(0, text.length - w.length), w]
      }
    }
    const mid = Math.ceil(chars.length / 2)
    return [chars.slice(0, mid).join(''), chars.slice(mid).join('')]
  }
  return merged
}

function makeAssemblyState(item, savedPickedTexts = null) {
  const sentence = (item?.sentences || [])[0] || ''
  const parts = splitSentenceParts(sentence, item?.words || [])
  const pieces = parts.map((text, i) => ({ id: `${i}-${text}`, text }))
  let picked = []
  let pool = pieces
  if (Array.isArray(savedPickedTexts) && savedPickedTexts.length) {
    const remain = [...pieces]
    picked = []
    for (const t of savedPickedTexts) {
      const idx = remain.findIndex((p) => p.text === t)
      if (idx < 0) continue
      picked.push(remain.splice(idx, 1)[0])
    }
    pool = shuffle(remain)
  } else {
    pool = shuffle(pieces)
  }
  return {
    sentence,
    parts, // 拆好的词语（参考顺序，不做对错判断）
    pool,
    picked,
  }
}

const state = {
  view: 'home', // home | exam | history | historyDetail
  homeTerm: '一上',
  homeOrder: makeHomeOrder('一上'),
  homeIndex: 0,
  homePickerOpen: false,
  showPinyin: loadShowPinyin(),
  examTerm: null, // null = pick 一上/一下 first
  examItems: [],
  examIndex: 0,
  examAudios: {}, // index -> dataUrl
  examAssemblies: {}, // index -> { picked texts }
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

function renderRecommendSentences(sentences, { showPinyin = false } = {}) {
  const list = (sentences || []).filter(Boolean).slice(0, 3)
  if (!list.length) return ''
  return `
    <div class="section-block">
      <h3>推荐造句</h3>
      <div class="sentences">
        ${list.map((s) => `<div class="sentence">${withPinyin(s, showPinyin)}</div>`).join('')}
      </div>
    </div>
  `
}

function renderAssemblyBlock(assembly, { showPinyin = false, readOnly = false, recommendSentences = [] } = {}) {
  const parts = assembly?.parts || []
  if (!parts.length && !assembly?.picked?.length) {
    return renderRecommendSentences(recommendSentences, { showPinyin }) ||
      `<div class="section-block"><h3>造句</h3><div class="empty-inline">暂无造句</div></div>`
  }
  if (readOnly) {
    const picked = assembly.picked?.length
      ? assembly.picked.map((t) => `<span class="chip assembled">${withPinyin(t, showPinyin)}</span>`).join('')
      : '<span class="assemble-placeholder">当时未点选</span>'
    return `
      <div class="section-block assemble-block">
        <h3>造句 · 点选记录</h3>
        <div class="assemble-board" aria-label="点选记录">${picked}</div>
      </div>
      ${renderRecommendSentences(recommendSentences, { showPinyin })}
    `
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
  return `
    <div class="section-block assemble-block">
      <h3>造句 · 点词组句</h3>
      <div class="assemble-board" aria-label="已选词语">${pickedHtml}</div>
      <div class="assemble-pool chips" aria-label="待选词语">${poolHtml}</div>
      <div class="assemble-actions">
        <button type="button" class="btn ghost small" data-action="assemble-reset">重来</button>
      </div>
    </div>
  `
}

function renderCharCard(item, { showPinyin = false, assembly = null, assemblyReadOnly = false } = {}) {
  const words = (item.words || []).slice(0, 5)
  const sentences = (item.sentences || []).slice(0, 3)
  const glyph = showPinyin
    ? `<div class="char-glyph char-glyph-py" aria-label="汉字">${withPinyinChar(item.char, true)}</div>`
    : `<div class="char-glyph" aria-label="汉字">${escapeHtml(item.char)}</div>`
  const sentenceBlock = assembly
    ? renderAssemblyBlock(assembly, {
        showPinyin,
        readOnly: assemblyReadOnly,
        recommendSentences: assemblyReadOnly ? sentences : [],
      })
    : renderRecommendSentences(sentences, { showPinyin }).replace('<h3>推荐造句</h3>', '<h3>造句</h3>')
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

function renderHomePicker() {
  const total = state.homeOrder.length
  if (!total) {
    return `
      <div class="char-picker" role="dialog" aria-modal="true" aria-label="选择汉字">
        <div class="char-picker-panel">
          <div class="char-picker-head">
            <h3>选择汉字</h3>
            <button type="button" class="btn ghost small" data-action="home-picker-close">关闭</button>
          </div>
          <div class="empty">该册暂无汉字</div>
        </div>
      </div>
    `
  }
  const cells = state.homeOrder
    .map((item, i) => {
      const active = i === state.homeIndex
      return `<button type="button" class="char-picker-cell ${active ? 'active' : ''}" data-action="home-jump" data-index="${i}" aria-current="${active ? 'true' : 'false'}">${escapeHtml(item.char)}</button>`
    })
    .join('')
  return `
    <div class="char-picker" role="dialog" aria-modal="true" aria-label="选择汉字">
      <button type="button" class="char-picker-backdrop" data-action="home-picker-close" aria-label="关闭"></button>
      <div class="char-picker-panel">
        <div class="char-picker-head">
          <div>
            <h3>选择汉字 · ${escapeHtml(state.homeTerm)}</h3>
            <p class="meta">共 ${total} 字，点选可跳转</p>
          </div>
          <button type="button" class="btn ghost small" data-action="home-picker-close">关闭</button>
        </div>
        <div class="char-picker-grid">${cells}</div>
      </div>
    </div>
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
          <button type="button" class="progress-btn meta" data-action="home-picker-open" title="点击选择汉字" ${total ? '' : 'disabled'}>
            ${total ? state.homeIndex + 1 : 0}/${total}
          </button>
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
      ${state.homePickerOpen ? renderHomePicker() : ''}
    </section>
  `
  document.querySelector('#app').innerHTML = shell(html)
  bindCommon()
  if (state.homePickerOpen) {
    const active = document.querySelector('.char-picker-cell.active')
    if (active) active.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
}

function remainingForTerm(term) {
  const pool = byTerm(term)
  const practiced = loadPracticed(term)
  const left = pool.filter((c) => !practiced.has(c.char))
  return { pool, practiced, left }
}

function snapshotExamAssembly() {
  if (!state.examAssembly || state.examIndex == null) return
  state.examAssemblies[state.examIndex] = {
    parts: state.examAssembly.parts || [],
    picked: (state.examAssembly.picked || []).map((p) => p.text),
    sentence: state.examAssembly.sentence || '',
  }
}

function ensureExamAssembly() {
  const item = state.examItems[state.examIndex]
  if (!item) {
    state.examAssembly = null
    return
  }
  if (!state.examAssembly || state.examAssembly._char !== item.char || state.examAssembly._index !== state.examIndex) {
    const saved = state.examAssemblies[state.examIndex]
    state.examAssembly = {
      ...makeAssemblyState(item, saved?.picked || null),
      _char: item.char,
      _index: state.examIndex,
    }
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
  state.examAssemblies = {}
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
  snapshotExamAssembly()
  const id = `exam_${Date.now()}`
  const termLabel = state.examTerm || ''
  const exam = {
    id,
    createdAt: Date.now(),
    term: state.examTerm,
    title: `练习${termLabel ? `·${termLabel}` : ''} ${new Date().toLocaleString('zh-CN')}`,
    items: state.examItems.map((item, i) => {
      const asm = state.examAssemblies[i] || {}
      return {
        char: item.char,
        words: item.words,
        sentences: item.sentences,
        audio: state.examAudios[i] || null,
        sentenceParts: asm.parts || splitSentenceParts((item.sentences || [])[0] || '', item.words || []),
        sentencePicked: Array.isArray(asm.picked) ? asm.picked : [],
      }
    }),
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
  state.examAssemblies = {}
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
      <div class="panel-head home-head">
        <div class="head-left">
          <h2>练习 · ${state.examTerm}</h2>
          <span class="meta">${state.examIndex + 1}/${state.examItems.length}</span>
        </div>
        <div class="home-toolbar">
          <label class="pinyin-switch">
            <input type="checkbox" data-action="toggle-pinyin" ${state.showPinyin ? 'checked' : ''} />
            <span class="switch-ui" aria-hidden="true"></span>
            <span>拼音</span>
          </label>
        </div>
      </div>
      ${renderCharCard(item, { showPinyin: state.showPinyin, assembly: state.examAssembly })}
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
  const hasPick = Array.isArray(item.sentencePicked)
  const assembly = hasPick
    ? {
        parts: item.sentenceParts || [],
        picked: item.sentencePicked,
        sentence: (item.sentences || [])[0] || '',
      }
    : null
  const html = `
    <section class="panel">
      <div class="panel-head">
        <h2>练习详情</h2>
        <div class="meta">
          <button class="btn ghost" data-action="back-history">返回列表</button>
          <span>${state.historyIndex + 1} / ${items.length}</span>
        </div>
      </div>
      ${renderCharCard(item, {
        showPinyin: state.showPinyin,
        assembly,
        assemblyReadOnly: Boolean(assembly),
      })}
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
      state.homePickerOpen = false
      if (next === 'exam') {
        state.examTerm = null
        state.examItems = []
        state.examIndex = 0
        state.examAudios = {}
        state.examAssemblies = {}
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
      state.homePickerOpen = false
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
      render()
      break
    }
    case 'home-prev':
      if (state.homeIndex > 0) state.homeIndex -= 1
      state.homePickerOpen = false
      renderHome()
      break
    case 'home-next':
      if (state.homeIndex < state.homeOrder.length - 1) state.homeIndex += 1
      state.homePickerOpen = false
      renderHome()
      break
    case 'home-picker-open':
      state.homePickerOpen = true
      renderHome()
      break
    case 'home-picker-close':
      state.homePickerOpen = false
      renderHome()
      break
    case 'home-jump': {
      const idx = Number(e.currentTarget.dataset.index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.homeOrder.length) break
      state.homeIndex = idx
      state.homePickerOpen = false
      renderHome()
      break
    }
    case 'exam-start': {
      const term = e.currentTarget.dataset.term
      if (term !== '一上' && term !== '一下') break
      startExam(term)
      renderExam()
      break
    }
    case 'exam-prev':
      if (state.examIndex > 0) {
        snapshotExamAssembly()
        state.examIndex -= 1
        state.examAssembly = null
      }
      renderExam()
      break
    case 'exam-next':
      if (state.examIndex < state.examItems.length - 1) {
        snapshotExamAssembly()
        state.examIndex += 1
        state.examAssembly = null
      }
      renderExam()
      break
    case 'exam-finish':
      await finishExam()
      break
    case 'assemble-pick': {
      if (!state.examAssembly) break
      const id = e.currentTarget.dataset.id
      const idx = state.examAssembly.pool.findIndex((p) => p.id === id)
      if (idx < 0) break
      const [piece] = state.examAssembly.pool.splice(idx, 1)
      state.examAssembly.picked.push(piece)
      snapshotExamAssembly()
      renderExam()
      break
    }
    case 'assemble-unpick': {
      if (!state.examAssembly) break
      const idx = Number(e.currentTarget.dataset.idx)
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.examAssembly.picked.length) break
      const [piece] = state.examAssembly.picked.splice(idx, 1)
      state.examAssembly.pool.push(piece)
      snapshotExamAssembly()
      renderExam()
      break
    }
    case 'assemble-reset': {
      if (!state.examAssembly) break
      const item = state.examItems[state.examIndex]
      state.examAssembly = {
        ...makeAssemblyState(item),
        _char: item.char,
        _index: state.examIndex,
      }
      snapshotExamAssembly()
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
