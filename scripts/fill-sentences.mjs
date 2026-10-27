/**
 * Fill missing 造句 with everyday sentences from Tatoeba (web corpus).
 * Prefer short, daily-use sentences. Never invent template套句.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as OpenCC from 'opencc-js'
import tatoebaMod from 'tatoeba-sentence-pairs-in-mandarin-chinese-english'

const tatoeba = Array.isArray(tatoebaMod) ? tatoebaMod : tatoebaMod?.default || tatoebaMod?.sentences || []
const converter = OpenCC.Converter({ from: 'tw', to: 'cn' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataPath = path.join(__dirname, '../src/data/characters.json')

const TEMPLATE_RE =
  /请用.+说一句|和小伙伴一起说|妈妈指着|图画书里看到了|教室黑板上写着|出现在这篇课文里|今天学了[“"]/

/** Adult / unsuitable content for grade-1 kids */
const UNSAFE_RE =
  /月经|怀孕|离婚|恋爱|接吻|喝酒|抽烟|赌博|色情|尸体|杀人|自杀|妓女|性交|乳房|阴茎|阴道|毒品|吸毒|还债|月经没来|上床|做爱/

function isChineseSentence(s) {
  if (!s || s.length < 4 || s.length > 22) return false
  if (TEMPLATE_RE.test(s)) return false
  if (UNSAFE_RE.test(s)) return false
  if (/[A-Za-z0-9]/.test(s)) return false
  const hans = [...s].filter((c) => c >= '\u4e00' && c <= '\u9fff').length
  return hans >= 3 && hans / s.length >= 0.45
}

function normalizeSentence(s) {
  let t = converter(String(s).trim())
  t = t.replace(/\s+/g, '')
  t = t.replace(/[｡．.]$/u, '。')
  if (!/[。！？]$/.test(t)) t += '。'
  // unify quotes
  t = t.replace(/[“”]/g, (m) => (m === '“' || m === '"' ? '“' : '”'))
  return t
}

function scoreSentence(s, ch, words = []) {
  let score = 0
  // shorter is better for grade 1
  score += Math.max(0, 28 - s.length) * 1.5
  if (/[。！？]$/.test(s)) score += 5
  if (/我|你|他|她|我们|妈妈|爸爸|老师|同学|今天|回家|上学|吃饭|看书|下雨|太阳|小鸟|作业|公园|小朋友/.test(s)) {
    score += 12
  }
  // bonus if uses one of this char's 组词
  for (const w of words) {
    if (w && s.includes(w)) score += 18
  }
  if (s.includes(ch)) score += 2
  // penalize classical / adult / odd loanwords
  if (/之|乎|者|亦|兮|哉|矣|曰/.test(s)) score -= 20
  if (/《|》|——|…/.test(s)) score -= 10
  if (/经济|义大利|专攻|债务|股票|离婚/.test(s)) score -= 30
  return score
}

function buildIndex(needed) {
  /** @type {Map<string, string[]>} */
  const map = new Map()
  for (const ch of needed) map.set(ch, [])

  let seen = 0
  for (const row of tatoeba) {
    const raw = row?.[1]
    if (!raw) continue
    const s = normalizeSentence(raw)
    if (!isChineseSentence(s)) continue
    seen += 1
    const chars = new Set([...s].filter((c) => needed.has(c)))
    for (const ch of chars) {
      const list = map.get(ch)
      if (!list) continue
      if (list.length >= 40) continue // cap candidates per char
      if (!list.includes(s)) list.push(s)
    }
  }
  console.log('indexed sentences scanned ok-ish rows', seen)
  return map
}

/** Hand-picked everyday sentences (teaching sites / daily speech) when corpus picks are weak */
const MANUAL = {
  赵: ['我姓赵。', '赵老师教我们语文。'],
  萍: ['池塘里浮着绿色的浮萍。'],
  经: ['我已经写完作业了。', '放学后我们经常一起玩。'],
  义: ['友谊让我们更快乐。', '这个故事很有意义。'],
  路: ['放学后我走路回家。', '这条马路很宽。'],
  班: ['我们班有很多小朋友。'],
  积: ['小朋友喜欢搭积木。'],
  川: ['远处的山川真好看。'],
  六: ['星期六我们去公园玩。'],
}

function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  // Always apply MANUAL overrides; refill empty/unsafe/weak corpus picks
  const weakPickRe = /经济|义大利|专攻|债务|股票/
  const needed = new Set(
    data
      .filter((x) => {
        if (MANUAL[x.char]?.length) return true
        const ss = x.sentences || []
        if (!ss.length) return true
        return ss.every(
          (s) => TEMPLATE_RE.test(s) || UNSAFE_RE.test(s) || weakPickRe.test(s) || !isChineseSentence(s)
        )
      })
      .map((x) => x.char)
  )
  console.log('need fill', needed.size)

  const index = buildIndex(needed)
  let filled = 0
  let stillEmpty = 0
  let kept = 0

  for (const item of data) {
    if (MANUAL[item.char]?.length) {
      item.sentences = MANUAL[item.char]
      filled += 1
      continue
    }

    const existing = (item.sentences || [])
      .filter((s) => s && !TEMPLATE_RE.test(s) && !UNSAFE_RE.test(s) && !weakPickRe.test(s))
      .map((s) => normalizeSentence(s))
      .filter((s) => s.length >= 4 && s.length <= 40)

    if (existing.length && !needed.has(item.char)) {
      item.sentences = existing.slice(0, 3)
      kept += 1
      continue
    }

    const cands = (index.get(item.char) || [])
      .slice()
      .sort(
        (a, b) =>
          scoreSentence(b, item.char, item.words || []) - scoreSentence(a, item.char, item.words || [])
      )
    const best = cands[0]
    if (best) {
      item.sentences = [best]
      filled += 1
    } else if (existing.length) {
      item.sentences = existing.slice(0, 1)
      kept += 1
    } else {
      item.sentences = []
      stillEmpty += 1
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8')
  console.log(JSON.stringify({ filled, kept, stillEmpty, total: data.length }, null, 2))
  for (const ch of ['路', '班', '哥', '赵', '萍', '经', '义']) {
    const item = data.find((x) => x.char === ch)
    console.log(ch, item?.sentences)
  }
}

main()
