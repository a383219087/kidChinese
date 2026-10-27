/**
 * Rebuild every character's 造句 for grade-1 kids.
 * Corpus-first, then SENTENCE_BANK / curated maps — never template fillers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataPath = path.join(root, 'src/data/characters.json')
const corpusPath = path.join(__dirname, 'raw/grade1-zaoju-corpus.txt')
const enrichPath = path.join(__dirname, 'enrich-characters.mjs')

const TEMPLATE_RE =
  /请用.+说一句|和小伙伴一起说|妈妈指着|图画书里看到了|教室黑板上写着|出现在这篇课文里|今天学了[“"]|请用耳朵认真听讲/

/** Hard-banned template patterns — must never appear in output. */
const HARD_BAN_RES = [
  /^公园里有/,
  /妈妈教我/,
  /我会写/,
  /课文中有/,
  /我们小组/,
  /书上画着/,
  /一起读词语/,
  /我们上课一起读/,
  /课文中有一个/,
  /“.+”这个字要一笔/,
  /老师教我们读“/,
  /这个词。$/,
]

const UNSAFE_RE =
  /你有刀|找不到刀|有刀吗|塞进|屁股|棍子塞|排尿|尿有问题|贝蒂|杀了他|杀了|怕死|装病|冻死了|拼命抢救|给病人|病人打针|护士轻轻|带我去医院|去医院|义大利|专攻|没耐性|耐性古怪|除非我死了|大病初愈|月经|怀孕|离婚|恋爱|接吻|喝酒|抽烟|赌博|色情|尸体|自杀|妓女|性交|乳房|阴茎|阴道|毒品|吸毒|还债|股票|债务|上床|做爱|爱滋|艾滋|尖刀|弯刀|你有枪|枪杀|杀人|流血|血淋淋|麻醉|割腕|塞入|色情|欠债|喝醉|吸烟|裸|强奸|绑架|恐怖|尸体|上吊|割脉|打屁股|揍|虐待|脏话/

const UNSAFE_WORD_RE =
  /爱滋|艾滋|一刀切|冻死|饿死|打死|病死|枪|毒|债|股票|离婚|护士|病人|尖刀|弯刀|拷贝|生死|心病|找遍|庇护|棍棒|大办|大案|大坝|霸王|非分|驰|六安|六盘水|八达岭|半辈子|半径|半岛|胞弟|弟子|弟兄|版画|动画片|勾画|花费|成名|驰名|哥们|棋坛|棋艺|棋手|上班|办班|班次|主办|开办|办案|办公|保本|版本|本土|出土|岔路|查问|反问/

const CLASSICAL_RE = /之乎|者也|亦.*矣|兮|哉|矣|曰/

const BARE_LIKE_RE = /^我喜欢[^。]{1,3}。$/
const BARE_THIS_RE = /^这是[^。]{1,3}。$/

const AWKWARD_RE = /公园里有.{0,2}(月|日|年)|书上画着.{0,2}(月|日)/

/** Fixed lines for numerals (no “我喜欢七月”). */
const NUMBER_CHAR_LINES = {
  一: ['我有一个红苹果。', '一天里要喝不少水。'],
  二: ['一年有十二个月。', '二加三等于五。'],
  三: ['三月里小草变绿了。', '三天不见很想你。'],
  四: ['四月到处开满花。', '教室里有四扇窗户。'],
  五: ['五颗星星亮晶晶。', '五颜六色真好看。'],
  六: ['星期六我们去公园玩。', '六月里荷花开满塘。'],
  七: ['七天刚好是一星期。', '七月里西瓜甜又甜。'],
  八: ['八月里还有暑假。', '八加二正好等于十。'],
  九: ['九月我们开学了。', '从一数到九。'],
  十: ['我十岁了。', '十月里桂花香。'],
}

const WORD_HOOKS = {
  '刀:剪刀': ['我用剪刀剪纸。', '劳动课上我们用剪刀。'],
  '贝:贝壳': ['海边有许多贝壳。', '我捡了一枚小贝壳。'],
  '贝:宝贝': ['宝贝是妈妈对我的爱。', '这个小布熊是我的宝贝。'],
  '找:找到': ['我找到了丢失的铅笔。', '我在书包里找到了橡皮。'],
  '找:寻找': ['我在花园里寻找小花。', '我们在草地里寻找虫虫。'],
  '问:问好': ['我向老师问好。', '上学路上我和同学问好。'],
  '问:问题': ['我有问题要问老师。', '不懂的问题要问清楚。'],
  '病:生病': ['我生病了，在家休息。', '弟弟生病了，妈妈照顾他。'],
  '棍:拐棍': ['爷爷走路拿着拐棍。', '奶奶把拐棍放在门边。'],
  '棍:棍子': ['我们用木棍做游戏。', '这根棍子可以当旗杆。'],
  '护:爱护': ['我们要爱护花草。', '爱护图书，轻轻翻阅。'],
  '护:保护': ['大家互相保护、互相帮助。', '我们要保护小动物。'],
  '川:山川': ['远处的山川真好看。', '山川被云遮住了。'],
  '口:窗口': ['请把窗口打开一点。', '窗口外面有风。'],
  '口:开口': ['我开口回答老师。', '哥哥开口唱歌。'],
}

/** vetted 组词 → full kid sentences (each line must read naturally). */
const WORD_LINE_MAP = {
  大家: ['大家都是好朋友。', '放学后大家一起去玩。'],
  大人: ['大人牵着小孩过马路。', '我长大了也要当大人。'],
  马路: ['这条马路又平又宽。', '汽车在马路上慢慢跑。'],
  走路: ['我每天走路去学校。', '放学我走路回家。'],
  上路: ['天一亮我们就上路了。', '上学路上我哼着歌。'],
  半路: ['走到半路下起小雨。', '走到半路我们歇一会儿。'],
  泥土: ['雨后地上有泥土。', '小坑里填满了泥土。'],
  土地: ['田野里的土地很软。', '农民在土地上种禾苗。'],
  尘土: ['大风吹过扬起尘土。', '汽车开过留下尘土。'],
  书本: ['书本里有许多故事。', '我把书本摆得整整齐齐。'],
  本子: ['本子要写得工工整整。', '我有一个干净的新本子。'],
  本来: ['本来天就阴阴的。', '这本来就不是我的。'],
  班级: ['我们班有许多小朋友。', '班级里窗明几净。'],
  名字: ['我的名字写在作业本上。', '你叫什么名字？'],
  国王: ['故事里有一位好国王。', '国王住在高高的城堡里。'],
  哥哥: ['哥哥带我去公园玩。', '我和哥哥一起看书。'],
  弟弟: ['弟弟和我同在一个班。', '弟弟把玩具分享给我。'],
  表哥: ['表哥周末来我家玩。', '我和表哥一起搭积木。'],
  表弟: ['表弟和我同岁。', '表弟最爱吃苹果。'],
  二哥: ['二哥帮我系鞋带。', '二哥在学校读二年级。'],
  图画: ['这幅图画色彩真美。', '我把图画贴在墙上。'],
  画画: ['美术课上我在画画。', '我用彩笔在纸上画画。'],
  花草: ['春天里花草长出来了。', '我们要爱护花草树木。'],
  花朵: ['花朵在阳光下开放。', '公园里的花朵五颜六色。'],
  花儿: ['枝头的花儿真香。', '风儿吹过，花儿在点头。'],
  打球: ['下课我们一起打球。', '操场上大家在打球。'],
  下棋: ['爷爷有空就和我下棋。', '下棋时要安静一点。'],
  棋子: ['棋盘上的棋子排整齐。', '黑棋子白棋子真好看。'],
  不是: ['这不是我的铅笔。', '这样做事是不对的。'],
  非常: ['今天我非常开心。', '妈妈做的菜非常好吃。'],
  初春: ['初春的小草探出了头。', '初春的风还略带凉意。'],
  一半: ['我吃了一半的苹果。', '一半云一半蓝天。'],
  半个: ['半个西瓜分给大家。', '半个包子留给我。'],
  办法: ['我们一起想个办法。', '这个问题有办法解决。'],
  当中: ['我坐在同学当中。', '队伍排在队伍当中。'],
  每当: ['每当下雨，我就带伞。', '每当放学，我就回家。'],
  问好: ['我向老师问好。', '上学路上我和同学问好。'],
  问题: ['我有问题要问老师。', '不懂的问题要问清楚。'],
  打开: ['请把窗户打开。', '打开门轻轻进来。'],
  打算: ['我打算周末去公园。', '爸爸打算带我去海边。'],
  足球: ['我和同学踢足球。', '足球在草地上滚。'],
  手工: ['美术课我们做手工。', '小手工作品真漂亮。'],
  回家: ['放学后我回家吃饭。', '天黑了，我们快回家。'],
  二月: ['二月里还是冬天。', '二月春节要到了。'],
  三月: ['三月里桃花开了。', '三月春风暖洋洋。'],
  四月: ['四月到处开满花。', '四月我们出去踏青。'],
  五月: ['五月劳动最光荣。', '五月天气变热了。'],
  六月: ['六月里荷花开满塘。', '六月天气越来越热。'],
  七月: ['七月里西瓜甜又甜。', '七月暑假开始了。'],
  八月: ['八月里还有暑假。', '八月太阳火辣辣的。'],
  九月: ['九月我们开学了。', '九月桂花香满校。'],
  十月: ['十月里桂花香。', '十月金秋到来了。'],
  十一月: ['十一月天气变凉。', '十一月我们穿厚衣。'],
  十二月: ['十二月里要过年。', '十二月雪花飘。'],
  六十: ['从一数到六十。', '爷爷今年六十岁。'],
  七十: ['七十岁是古稀之年。', '从十数到七十。'],
  八十: ['从十数到八十。', '八十岁要祝寿。'],
  九十: ['从十数到九十。', '九十岁是高寿。'],
  十一: ['从一数到十一。', '十一月天气变凉。'],
  二十: ['二十个小朋友排成队。', '二十比十更大。'],
  三十: ['三十个苹果装一箱。', '三十天是一个月。'],
  四十: ['四十分钟一节课。', '从一数到四十。'],
  五十: ['五十步就走到校门口。', '从十数到五十。'],
  十五: ['十五个小朋友做游戏。', '十五天是半个月。'],
  十二: ['十二个月是一年。', '十二点钟吃午饭。'],
  十四: ['十四只小鸟飞上天。', '十四是一个双数。'],
  七天: ['七天刚好是一星期。', '七天不见很想念。'],
}

const CHAR_EXTRA = {
  刀: ['我用剪刀剪纸。', '劳动课上我们用剪刀。'],
  贝: ['海边有许多贝壳。', '宝贝是妈妈对我的爱。'],
  找: ['我在书包里找橡皮。', '我找到了丢失的铅笔。'],
  问: ['我向老师问好。', '我有问题要问老师。'],
  病: ['我生病了，在家休息。', '弟弟生病了，妈妈照顾他。'],
  死: ['秋天，一些叶子枯死了。', '小草冬天也不会枯死。'],
  棍: ['爷爷走路拿着拐棍。', '我们用木棍做游戏。'],
  护: ['我们要爱护花草。', '大家互相保护、互相帮助。'],
  院: ['同学们在院子里跳绳。', '学校院子里的花开了。'],
  冻: ['冬天水会冻成冰。', '天太冷了，我的手冻红了。'],
  非: ['我分清是与非。', '今天我非常开心。'],
  性: ['小猫的性子很温顺。', '同学们性情都很友好。'],
  命: ['我们要爱惜小生命。', '小蚂蚁也是一条生命。'],
  路: ['放学后我走路回家。', '这条马路很宽。'],
  大: ['哥哥比我大。', '大家都到齐了。'],
  土: ['田野里的土地很软。', '雨后地上有泥土。'],
  本: ['书本里有许多故事。', '我的本子很干净。'],
  班: ['我们班有许多小朋友。', '班级里窗明几净。'],
  名: ['我的名字写在作业本上。', '你叫什么名字？'],
  王: ['我姓王。', '故事里有一位好国王。'],
  哥: ['哥哥带我去公园玩。', '我和哥哥一起看书。'],
  弟: ['弟弟和我同在一个班。', '弟弟把玩具分享给我。'],
  画: ['美术课上我在画画。', '这幅图画色彩真美。'],
  花: ['春天里花儿开放了。', '公园里的花朵五颜六色。'],
  打: ['下课我们一起打球。', '打开窗户通通风。'],
  棋: ['爷爷有空就和我下棋。', '棋盘上的棋子排整齐。'],
  办: ['我们一起想个办法。', '老师帮我想办法。'],
  半: ['我吃了一半的苹果。', '半个西瓜分给大家。'],
  初: ['初春的小草探出了头。', '新学期是一个新开始。'],
  当: ['每当下雨，我就带伞。', '我坐在同学当中。'],
  安: ['过马路要注意安全。', '祝爷爷奶奶平安健康。'],
  七: ['七天刚好是一星期。', '七月里西瓜甜又甜。'],
  八: ['八月里还有暑假。', '八加二正好等于十。'],
  九: ['九月我们开学了。', '从一数到九。'],
  十: ['我十岁了。', '十月里桂花香。'],
  积: ['小朋友喜欢搭积木。', '雪地上积了一层白。'],
  句: ['这句话我读得很流利。', '古诗里有许多好句。'],
  词: ['词语要读得准确。', '新词我写在本子上。'],
  纸: ['纸张白白又干净。', '我用彩纸做手工。'],
  鸭: ['鸭子在水里游泳。', '小鸭子跟在鸭妈妈后面。'],
  蓝: ['蓝蓝的天空真美呀。', '蓝蓝的天上飘着云朵。'],
  马: ['马儿在草地上跑。', '木马在游乐场里转。'],
  驰: ['骏马在草原奔驰。', '汽车在高速上飞驰。'],
  经: ['我已经写完作业了。', '放学后我们经常一起玩。'],
  义: ['友谊让我们更快乐。', '这个故事很有意义。'],
  川: ['远处的山川真好看。', '山川被云遮住了。'],
  六: ['星期六我们去公园玩。', '六月里荷花开满塘。'],
}

const MANUAL_BANK = {
  赵: ['我姓赵。', '赵老师教我们语文。'],
  萍: ['池塘里浮着绿色的浮萍。'],
  经: ['我已经写完作业了。', '放学后我们经常一起玩。'],
  义: ['友谊让我们更快乐。', '这个故事很有意义。'],
  路: ['放学后我走路回家。', '这条马路很宽。'],
  班: ['我们班有很多小朋友。'],
  积: ['小朋友喜欢搭积木。'],
  川: ['远处的山川真好看。'],
  六: ['星期六我们去公园玩。', '六月里荷花开满塘。'],
  哥: ['哥哥带我去公园玩。', '我和哥哥一起看书。'],
}

function loadSentenceBank() {
  const src = fs.readFileSync(enrichPath, 'utf8')
  const start = src.indexOf('const SENTENCE_BANK = ')
  const end = src.indexOf('\nfunction kidFriendlyWords')
  if (start < 0 || end < 0) throw new Error('SENTENCE_BANK not found in enrich-characters.mjs')
  const objStr = src.slice(start + 'const SENTENCE_BANK = '.length, end)
  return new Function(`return (${objStr})`)()
}

function loadEduShangWords() {
  const src = fs.readFileSync(enrichPath, 'utf8')
  const m = src.match(/const shang = `([\s\S]*?)`\s*\n/)
  if (!m) return new Map()
  const map = new Map()
  for (const line of m[1].split('\n')) {
    const t = line.trim()
    if (!t) continue
    const ch = t[0]
    if (!/[\u4e00-\u9fff]/.test(ch)) continue
    const words = [...t.matchAll(/[（(]\s*([^）)]+?)\s*[）)]/g)]
      .map((x) => x[1].replace(/\s+/g, ''))
      .flatMap((chunk) => chunk.split(/[、，,；;／/]/).map((s) => s.trim()))
      .filter(Boolean)
    if (words.length) map.set(ch, words)
  }
  return map
}

function loadCorpus() {
  if (!fs.existsSync(corpusPath)) return []
  return fs
    .readFileSync(corpusPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function buildCorpusIndex(lines) {
  const byChar = new Map()
  const all = new Set(lines)
  for (const raw of all) {
    const s = normalizeSentence(raw)
    if (!isNaturalSentence(s)) continue
    const chars = new Set(
      [...s].filter((c) => c >= '\u4e00' && c <= '\u9fff')
    )
    for (const c of chars) {
      if (!byChar.has(c)) byChar.set(c, [])
      byChar.get(c).push(s)
    }
  }
  return byChar
}

function normalizeSentence(s) {
  let t = String(s || '').trim().replace(/\s+/g, '')
  t = t.replace(/[｡．.]$/u, '。')
  if (!/[。！？]$/.test(t)) t += '。'
  return t
}

function isHardBanned(s) {
  return HARD_BAN_RES.some((re) => re.test(s))
}

function hanCount(s) {
  return [...s.replace(/[。！？，、；：""''（）]/g, '')].filter(
    (c) => c >= '\u4e00' && c <= '\u9fff'
  ).length
}

function isBarePattern(s) {
  return BARE_LIKE_RE.test(s) || BARE_THIS_RE.test(s)
}

function isSafeSentence(s) {
  if (!s || typeof s !== 'string') return false
  const t = normalizeSentence(s)
  if (hanCount(t) < 4 || hanCount(t) > 14) return false
  if (TEMPLATE_RE.test(t)) return false
  if (isHardBanned(t)) return false
  if (UNSAFE_RE.test(t)) return false
  if (CLASSICAL_RE.test(t)) return false
  if (/[A-Za-z0-9]/.test(t)) return false
  if (/《|》|——|…/.test(t)) return false
  return true
}

function isNaturalSentence(s, { allowBareFromBank = false } = {}) {
  if (!isSafeSentence(s)) return false
  if (!allowBareFromBank && isBarePattern(s)) return false
  if (AWKWARD_RE.test(s)) return false
  return true
}

function isSafeWord(w) {
  if (!w || w.length < 2 || w.length > 6) return false
  if (UNSAFE_WORD_RE.test(w)) return false
  if (![...w].every((c) => c >= '\u4e00' && c <= '\u9fff')) return false
  return true
}

function sentenceUsesChar(s, ch, words) {
  if (s.includes(ch)) return true
  return (words || []).some((w) => w && w.length >= 2 && s.includes(w))
}

function linesForWord(w, ch) {
  if (!isSafeWord(w) || !w.includes(ch)) return []
  const out = []

  if (WORD_LINE_MAP[w]) {
    out.push(...WORD_LINE_MAP[w])
  }

  if (/^(哥哥|弟弟|姐姐|妹妹|表弟|二哥|奶奶|爷爷|大哥|小妹)$/.test(w)) {
    out.push(`我和${w}一起做游戏。`)
    if (w === '哥哥') out.push('哥哥带我去公园玩。')
    if (w === '弟弟') out.push('弟弟和我同在一个班。')
  }

  if (/^(一|二|三|四|五|六|七|八|九|十|十一|十二)月$/.test(w)) {
    out.push(`${w}里天气慢慢变暖。`)
    if (WORD_LINE_MAP[w]) out.unshift(...WORD_LINE_MAP[w])
    return [...new Set(out.map(normalizeSentence))].filter(
      (s) => isNaturalSentence(s) && s.includes(ch) && hanCount(s) >= 4 && hanCount(s) <= 14
    )
  }

  if (/^(一|二|三|四|五|六|七|八|九|十)日$/.test(w) || /月份$/.test(w)) {
    return []
  }

  return [...new Set(out.map(normalizeSentence))].filter(
    (s) => isNaturalSentence(s) && s.includes(ch) && hanCount(s) >= 4 && hanCount(s) <= 14
  )
}

function hashSeed(ch) {
  return parseInt(createHash('md5').update(ch).digest('hex').slice(0, 8), 16)
}

const CHAR_SEMANTIC_BOOST = {
  马: [/马儿|木马|骏马|一匹马|匹马来/],
  六: [/六月|星期六|六个|六岁|六加/],
}

const CHAR_SEMANTIC_PENALTY = {
  马: [/鞭子|鞭/],
}

function scoreSentence(s, ch, words) {
  let score = 0
  score += Math.max(0, 16 - hanCount(s)) * 2
  if (s.includes(ch)) score += 8
  for (const w of words) {
    if (w && s.includes(w)) score += 20
  }
  for (const re of CHAR_SEMANTIC_BOOST[ch] || []) {
    if (re.test(s)) score += 28
  }
  if (ch === '六' && /六十|六十一/.test(s) && !/六月|星期六/.test(s)) score -= 18
  for (const re of CHAR_SEMANTIC_PENALTY[ch] || []) {
    if (re.test(s)) score -= 22
  }
  if (/我|你|他|她|我们|妈妈|爸爸|老师|同学|今天|回家|上学|吃饭|看书|下雨|太阳|小鸟|作业|公园|小朋友|学校|春天|夏天/.test(s)) {
    score += 10
  }
  if (/谁|粒粒皆辛苦|人山人海|心灵|如隔三秋/.test(s)) score -= 25
  if (isBarePattern(s)) score -= 100
  return score
}

function corpusCandidates(ch, words, corpusIndex) {
  const seen = new Set()
  const out = []
  const wordList = [...new Set(words || [])].filter(isSafeWord)

  const fromChar = corpusIndex.get(ch) || []
  for (const s of fromChar) {
    const n = normalizeSentence(s)
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }

  for (const w of wordList) {
    if (!w.includes(ch)) continue
    for (const c of w) {
      if (c < '\u4e00' || c > '\u9fff') continue
      for (const s of corpusIndex.get(c) || []) {
        if (!s.includes(w)) continue
        const n = normalizeSentence(s)
        if (seen.has(n)) continue
        seen.add(n)
        out.push(n)
      }
    }
  }

  return out
    .filter((s) => isNaturalSentence(s) && sentenceUsesChar(s, ch, words))
    .sort((a, b) => scoreSentence(b, ch, words) - scoreSentence(a, ch, words) || a.length - b.length)
}

function collectCuratedSentences(ch, words, eduWords) {
  const seen = new Set()
  const out = []

  const add = (s, bonus = 0) => {
    const n = normalizeSentence(s)
    if (!isNaturalSentence(n) || !sentenceUsesChar(n, ch, words) || seen.has(n)) return
    seen.add(n)
    out.push({ s: n, score: scoreSentence(n, ch, words) + bonus })
  }

  for (const s of NUMBER_CHAR_LINES[ch] || []) add(s, 40)

  const wordList = [...new Set([...(eduWords || []), ...(words || [])])]
  for (const w of wordList) {
    const hookKey = `${ch}:${w}`
    for (const raw of WORD_HOOKS[hookKey] || []) add(raw, 60)
    for (const s of linesForWord(w, ch)) add(s, 30)
  }

  for (const s of CHAR_EXTRA[ch] || []) add(s, 50)

  out.sort((a, b) => b.score - a.score || a.s.length - b.s.length)
  return out.map((x) => x.s)
}

function tierSentences(list, ch, words, { requireChar = true, allowBare = false } = {}) {
  return list
    .map((s) => normalizeSentence(s))
    .filter((s) => {
      if (!isNaturalSentence(s, { allowBareFromBank: allowBare })) return false
      if (requireChar && !sentenceUsesChar(s, ch, words)) return false
      return true
    })
    .sort((a, b) => scoreSentence(b, ch, words) - scoreSentence(a, ch, words) || a.length - b.length)
}

function buildSentences(item, bank, eduMap, corpusIndex, corpusSet) {
  const ch = item.char
  const words = Array.isArray(item.words) ? item.words : []
  const eduWords = eduMap.get(ch) || []

  const tiers = [
    tierSentences(corpusCandidates(ch, words, corpusIndex), ch, words),
    tierSentences(bank[ch] || [], ch, words, { requireChar: false, allowBare: true }),
    tierSentences(CHAR_EXTRA[ch] || [], ch, words),
    tierSentences(NUMBER_CHAR_LINES[ch] || [], ch, words),
    tierSentences(MANUAL_BANK[ch] || [], ch, words, { requireChar: false }),
    tierSentences(collectCuratedSentences(ch, words, eduWords), ch, words),
  ]

  const picked = []
  let corpusHit = false
  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti]
    for (const s of tier) {
      if (picked.includes(s)) continue
      if (ti > 0 && isBarePattern(s)) continue
      if (ti === 0) corpusHit = true
      picked.push(s)
      if (picked.length >= 2) break
    }
    if (picked.length >= 2) break
  }

  if (picked.length === 0) {
    for (const s of CHAR_EXTRA[ch] || []) {
      const n = normalizeSentence(s)
      if (isNaturalSentence(n) && sentenceUsesChar(n, ch, words)) {
        picked.push(n)
        break
      }
    }
  }

  const usedCorpus = picked.some((s) => corpusSet.has(normalizeSentence(s)))
  return { sentences: picked.slice(0, 2), usedCorpus: usedCorpus || corpusHit }
}

function main() {
  const corpusLines = loadCorpus()
  const corpusIndex = buildCorpusIndex(corpusLines)
  const corpusSet = new Set(
    corpusLines.map((l) => normalizeSentence(l)).filter((s) => isNaturalSentence(s))
  )

  const bank = loadSentenceBank()
  const eduMap = loadEduShangWords()
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

  let written = 0
  let corpusChars = 0
  let oneSentence = 0
  let twoSentences = 0
  const banPattern =
    /^公园里有|妈妈教我|我会写|课文中有|我们小组|书上画着/

  for (const item of data) {
    const { sentences, usedCorpus } = buildSentences(item, bank, eduMap, corpusIndex, corpusSet)
    item.sentences = sentences
    written += sentences.length
    if (usedCorpus) corpusChars += 1
    if (sentences.length === 1) oneSentence += 1
    if (sentences.length === 2) twoSentences += 1
  }

  let banHits = 0
  for (const item of data) {
    for (const s of item.sentences || []) {
      if (banPattern.test(s) || isHardBanned(s)) banHits += 1
    }
  }

  const empty = data.filter((x) => !x.sentences?.length).length
  const unsafeHits = data.filter((x) => (x.sentences || []).some((s) => UNSAFE_RE.test(s))).length

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8')

  console.log(
    JSON.stringify(
      {
        corpusSize: corpusLines.length,
        corpusIndexedChars: corpusIndex.size,
        totalChars: data.length,
        sentencesWritten: written,
        charsWithCorpusSentence: corpusChars,
        charsWithOneSentence: oneSentence,
        charsWithTwoSentences: twoSentences,
        emptySentences: empty,
        templateBanHits: banHits,
        unsafeKeywordHits: unsafeHits,
      },
      null,
      2
    )
  )

  const spot = '刀问棍死病贝找护马纸鸭蓝六非初哥积词句'.split('')
  for (const ch of spot) {
    const item = data.find((x) => x.char === ch)
    console.log(ch, item?.sentences)
  }

  if (banHits > 0 || unsafeHits > 0) process.exitCode = 1
}

main()
