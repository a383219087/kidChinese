# -*- coding: utf-8 -*-
from pypdf import PdfReader
import re, json, random, hashlib, os

path = "/Users/cqj/Downloads/1_1·6识字文字版.pdf"
reader = PdfReader(path)
chars = []
seen = set()
for i, page in enumerate(reader.pages[:12]):
    text = page.extract_text() or ""
    text = text.strip()
    text = re.sub(r"^一\s*上\s*", "", text)
    text = re.sub(r"^一\s*下\s*", "", text)
    text = text.replace("一上", "").replace("一下", "")
    for ch in text:
        if "\u4e00" <= ch <= "\u9fff":
            if ch not in seen:
                seen.add(ch)
                chars.append(ch)
print("unique", len(chars))

WORD_BANK = """
天地 人们 你们 我们 他们 一人 二人 三天 四季 五个 上下 口耳 耳目 手足 站立 坐下 日出 月亮 山水 山川 河水 大火 水田 禾苗 六一 七月 八月 九月 十月 爸爸 妈妈 大人 大马 马路 土地 书本 学习 学校 班级 姓名 大王 哥哥 弟弟 画画 花朵 打球 下棋 积木 写字 词语 句子 桌子 白纸 读书 看书 鱼儿 鸭子 乌鸦 中午 星星 星期 语文 数学 写字 开会 白菜 西瓜 水果 小鸟 小桥 流水 杨柳 开花 下雪 夜晚 夜色 美丽 蓝色 白云 青草 草原 冰雪 自己 自行车 晚上 昨天 今天 明天 这个 那个 去年 秋天 天气 叶子 树叶 黄色 一片 从来 飞来 江南 采莲 莲花 游戏 中间 东北 的家 家里 公鸡 母鸡 竹子 牙齿 用力 几步 没有 参加 鸟儿 说话 是的 春天 青草 青蛙 夏天 着火 皮球 地方 就是 冬天 男女 关心 正在 反正 先后 内外 对面 唱歌 下雨 大风 虫子 清水 绿色 桃花 红色 力量 尖刀 灰尘 众人 双手 树林 森林 不要 一条 开心 金子 书包 尺子 作业 铅笔 小刀 宝贝 少年 上课 早上 升起 国旗 中国 我们 声音 起来 多么 向上 站立 老师 工人 工厂 医院 医生 大门 门卫 小船 弯儿 两头 在家 里面 看见 闪电 影子 前面 常常 黑狗 左右 它的 好人 朋友 一件 有的 和平 做事 也是 办法 到了 又是 才能 爷爷 奶奶 叔叔 姐姐 妹妹 比较 尾巴 谁家 长短 一把 雨伞 兔子 最爱 公鸡 喝水 一只 到处 找到 许愿 石头 出去 办法 放学 进去 高兴 点数 彩色 一半 空气 问问 回答 方向 好久 更加 长长 牛羊 爪子 元旦 拼音
霜花 吹风 落下 降临 飘落 游泳 水池 进入 姓氏 李子 张开 古代 胡子 吴国 赵钱 孙子 周围 王子 官员 清澈 晴天 眼睛 保护 伤害 做事 事情 请客 让开 生病 相遇 喜欢 害怕 攻击 语言 互相 命令 运动 万一 纯净 阴天 雷电 一阵 冰块 冷冻 夹子 吃饭 忘记
水井 村庄 叫声 毛主席 乡村 亲人 战士 见面 想念 告诉 就是 北京 城市 安全 广场 非常 壮观 宽阔 太阳 道路 送别 忙碌 品尝 香甜 温暖 应该 颜色 因为 车辆 一匹 一册 一支 铅笔 一棵 架子 一块 捉迷藏 着急 一直 河流 也行 死信 跟随 忽然 喊叫 身体 这只 鸟窝 孤单 种子
都是 邻居 招呼 睡觉 快乐 怎么 独自 跳绳 讲话 得到 羽毛 皮球 游戏 排队 篮球 连连 运动 安静 夜晚 思念 床上 光线 怀疑 举手 望远 低头 故意 大胆 勇敢 向往 外面 勇气 窗户 混乱 偏偏 散步 原来 好像 微笑 再次 端正 兰花 过节 总是 大米 中间 分开 一样 豆子 肉食 带走 传说 纪念 彩虹 一座 浇水 如果 提问 洒水
挑水 高兴 镜子 拿着 照相 千万 裙子 眉毛 鼻子 嘴巴 脖子 手臂 肚皮 腿脚 脚丫 蜻蜓 迷路 捉迷藏 制造 蚂蚁 粮食 蜘蛛 蛛网 圆形 严寒 酷暑 凉爽 早晨 仔细 朝霞 夕阳 柳树 杨树 操场 拔河 拍球 跑步 踢球 铃声 热闹 锻炼 身体 之初 人性 善良 学习 教育 宝贵 专心 幼儿 玉石 器具
知道 意义 吃饭 能够 吃饱 喝茶 泡沫 轻轻 鞭炮 首先 踪迹 浮萍 泉水 流水 爱心 柔软 荷花 露珠 角色 珍珠 摇晃 躺下 水晶 停车 机器 展开 透明 翅膀 唱歌 花朵 腰部 山坡 沉重 伸展 潮湿 呢喃 空气 闷热 消息 搬家 响声 木棍 汤水 扇子 椅子 萤火 牵手 织布 打斗 工具 一次 丢失 哪里 新年 每天 平常 她们
一些 仔细 所以 伙伴 时钟 丁香 元旦 迟到 洗澡 背书 刚才 共同 汽车 决定 已经 动物 老虎 熊猫 通过 注意 一遍 一百 舌头 鬼脸 脸庞 准备 第一 猴子 结果 掰开 扛着 满满 扔掉 摘花 捧着 瓜果 拥抱 蹦跳 追赶 吵架 胖子 岁月 发现 车票 交换 弓箭 甘甜 棉花 娘亲 治疗 燕子 别人 干净 然后 奇怪 一颗 瓢虫 碧绿 吐出
啦啦 咕咚 成熟 掉落 吓唬 山羊 梅花鹿 逃跑 生命 大象 野兽 拦住 带领 墙壁 借书 墙角 蚊子 咬人 打断 您好 拨开 甩开 赶走 房子 傻瓜 转身 卫生 刷牙 梳头 毛巾 擦拭 肥皂 洗澡 脸盆
天地人 小学生 汉字 组词 造句 春天来了 好好学习 天天向上 爸爸妈妈 老师同学 中国人 小朋友 大太阳 小雨点 白云朵 红苹果 绿树叶 黄花儿 一本书 一支笔 一张纸 一座山 一条河 一只鸟 两只手 三个人 四面风 五彩云 六一节 七月天 八月十五 九月九 十个字
""".split()

words_all = []
ws = set()
for w in WORD_BANK:
    w = w.strip()
    if len(w) >= 2 and w not in ws:
        ws.add(w)
        words_all.append(w)

SENTENCE_TEMPLATES = [
    "我认识「{c}」这个字。",
    "请用「{c}」组一个词。",
    "小朋友会写「{c}」吗？",
    "今天我们学习「{c}」字。",
    "「{w}」里有「{c}」字。",
    "我会读「{w}」。",
    "老师教我们写「{c}」。",
    "「{w}」真有意思。",
    "请大声读出「{c}」。",
    "用「{w}」说一句话。",
]

entries = []
for c in chars:
    related = [w for w in words_all if c in w]
    seed = int(hashlib.md5(c.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    rng.shuffle(related)
    if not related:
        related = [c + c, "小" + c, c + "子"]
        related = [w for w in related if len(w) >= 2][:3]
    n_w = 1 + (seed % 5)
    picked_words = related[:n_w]
    if not picked_words:
        picked_words = [c + "字"]
    n_s = 1 + (seed % 3)
    sents = []
    for i in range(n_s):
        tpl = SENTENCE_TEMPLATES[(seed + i) % len(SENTENCE_TEMPLATES)]
        w = picked_words[i % len(picked_words)]
        sents.append(tpl.format(c=c, w=w))
    entries.append({"char": c, "words": picked_words, "sentences": sents})

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "src", "data", "characters.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)
print("wrote", len(entries), "to", out)
print("sample", entries[0], entries[50], entries[-1])
