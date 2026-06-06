import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workbookPath = path.join(repoRoot, "詞彙分級表L1L2.xlsx");
const backupPath = path.join(repoRoot, "詞彙分級表L1L2_backup.xlsx");
const posMapPath = path.join(repoRoot, "outputs", "l1l2_pos_map.json");

function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("／", "/")
    .replaceAll("’", "'")
    .replace(/\s+/g, " ");
}

function firstEnglishForm(word) {
  const cleaned = String(word ?? "")
    .replace(/\s*\(\d+\)/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  const first = cleaned.split("/")[0].trim();
  return first.replace(/\.$/, "");
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function articleFor(word) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function firstGloss(meaning) {
  return String(meaning ?? "")
    .replace(/[()]/g, "")
    .split(/[；、，]/)[0]
    .trim();
}

function parseBilingual(example) {
  const text = String(example ?? "").trim();
  const match = text.match(/^(.*?)(?:\s*\((.*)\))?$/);
  return {
    english: (match?.[1] ?? text).trim(),
    chinese: (match?.[2] ?? "").trim(),
  };
}

function rewriteExistingExample(example, rowIndex) {
  const { english, chinese } = parseBilingual(example);
  if (!english) return "";

  const substitutions = [
    { en: /\bstudents\b/gi, enTo: "children", zh: /學生/g, zhTo: "孩子" },
    { en: /\bschool\b/gi, enTo: "class", zh: /學校/g, zhTo: "課堂" },
    { en: /\blibrary\b/gi, enTo: "classroom", zh: /圖書館/g, zhTo: "教室" },
    { en: /\bmy\b/gi, enTo: "our", zh: /我的/g, zhTo: "我們的" },
    { en: /\bwe\b/gi, enTo: "they", zh: /我們/g, zhTo: "他們" },
    { en: /\bshe\b/gi, enTo: "the girl", zh: /她/g, zhTo: "那個女孩" },
    { en: /\bhe\b/gi, enTo: "the boy", zh: /他/g, zhTo: "那個男孩" },
    { en: /\bhouse\b/gi, enTo: "home", zh: /房子/g, zhTo: "家" },
    { en: /\bthis\b/gi, enTo: "that", zh: /這/g, zhTo: "那" },
    { en: /\bnew\b/gi, enTo: "different", zh: /新的/g, zhTo: "不同的" },
    { en: /\bevery\b/gi, enTo: "each", zh: /每個/g, zhTo: "每一個" },
  ];

  let newEnglish = english;
  let newChinese = chinese;
  const pick = substitutions[rowIndex % substitutions.length];

  if (pick.en.test(newEnglish) && (!newChinese || pick.zh.test(newChinese))) {
    newEnglish = newEnglish.replace(pick.en, pick.enTo);
    if (newChinese) newChinese = newChinese.replace(pick.zh, pick.zhTo);
  } else if (/\bThis\b/.test(newEnglish) || /\bthis\b/.test(newEnglish)) {
    newEnglish = newEnglish.replace(/\bThis\b/g, "That").replace(/\bthis\b/g, "that");
    if (newChinese) newChinese = newChinese.replace(/這/g, "那");
  } else {
    return "";
  }

  return newChinese ? `${newEnglish} (${newChinese})` : newEnglish;
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function exactExample(entry) {
  const key = normalize(entry);
  const map = {
    baby: ["The baby smiled at her mother.", "那個嬰兒對媽媽微笑。"],
    beginner: ["The beginner learned the first lesson quickly.", "那位初學者很快學會第一課。"],
    blackboard: ["The teacher wrote the answer on the blackboard.", "老師把答案寫在黑板上。"],
    bloody: ["He cleaned the bloody towel carefully.", "他小心地清洗那條沾血的毛巾。"],
    bony: ["The stray dog looked thin and bony.", "那隻流浪狗看起來又瘦又骨瘦如柴。"],
    christmas: ["We exchange gifts at Christmas.", "我們在聖誕節交換禮物。"],
    "christmas/xmas": ["We exchange gifts at Christmas.", "我們在聖誕節交換禮物。"],
    today: ["Today is my birthday.", "今天是我的生日。"],
    tomorrow: ["We will visit the museum tomorrow.", "我們明天會參觀博物館。"],
    yesterday: ["I finished the book yesterday.", "我昨天讀完了那本書。"],
    "a/an": ["This is a book, and that is an apple.", "這是一本書，而那是一顆蘋果。"],
    am: ["I am ready for class.", "我已經準備好上課了。"],
    are: ["They are in the classroom now.", "他們現在在教室裡。"],
    and: ["Tom and Amy are good friends.", "湯姆和艾美是好朋友。"],
    at: ["We will meet at the school gate.", "我們會在校門口見面。"],
    after: ["We went home after class.", "我們下課後回家了。"],
    afternoon: ["We usually play basketball in the afternoon.", "我們通常在下午打籃球。"],
    again: ["Please read the sentence again.", "請再讀一次這個句子。"],
    ago: ["I met him two years ago.", "我兩年前見過他。"],
    against: ["He put the bike against the wall.", "他把腳踏車靠在牆邊。"],
    age: ["Age is only a number to her.", "對她來說，年齡只是一個數字。"],
    about: ["We talked about the trip at lunch.", "我們在午餐時談到那趟旅行。"],
    above: ["The clock is above the door.", "時鐘在門的上方。"],
    according: ["According to the teacher, the test is next week.", "根據老師的說法，考試在下週。"],
    "according to": ["According to the teacher, the test is next week.", "根據老師的說法，考試在下週。"],
    across: ["The bank is across the street.", "銀行在街道的對面。"],
    able: ["She is able to finish the work alone.", "她能夠獨自完成這份工作。"],
    act: ["He likes to act in school plays.", "他喜歡在學校戲劇裡表演。"],
    action: ["We must take action right away.", "我們必須立刻採取行動。"],
    add: ["Please add some sugar to the tea.", "請在茶裡加一點糖。"],
    address: ["Please write your address on the card.", "請把你的地址寫在卡片上。"],
    airmail: ["The letter was sent by airmail yesterday.", "那封信昨天用航空郵件寄出了。"],
    all: ["All the students were excited.", "所有學生都很興奮。"],
    both: ["Both students finished the task on time.", "兩位學生都準時完成了任務。"],
    abroad: ["My cousin wants to study abroad next year.", "我表哥明年想出國讀書。"],
    absence: ["Her absence worried the teacher.", "她的缺席讓老師很擔心。"],
    absent: ["Tom was absent from school on Monday.", "湯姆星期一沒有來學校。"],
    active: ["The students are active in class.", "學生們在課堂上很積極。"],
    addition: ["The addition of one chair made the room better.", "多加一張椅子讓房間更方便了。"],
    affair: ["That is a private family affair.", "那是一件私人的家庭事情。"],
    airline: ["The airline changed our flight time.", "那家航空公司改了我們的航班時間。"],
    almond: ["She ate a few almonds after lunch.", "她午餐後吃了幾顆杏仁。"],
    aloud: ["Please read the poem aloud.", "請大聲朗讀這首詩。"],
    alphabet: ["The children are learning the alphabet song.", "孩子們正在學字母歌。"],
    anytime: ["You can call me anytime.", "你可以隨時打給我。"],
    ant: ["We found an ant on the ground.", "我們在地上看到一隻螞蟻。"],
    ape: ["We saw an ape at the zoo.", "我們在動物園看到一隻大猩猩。"],
    armchair: ["The armchair is near the window.", "那張扶手椅在窗邊。"],
    "baby-sit": ["She will baby-sit for her neighbor tonight.", "她今晚會幫鄰居臨時照顧小孩。"],
    bakery: ["We stopped by the bakery after school.", "我們放學後順路去了麵包店。"],
    bamboo: ["The panda is eating bamboo.", "那隻熊貓正在吃竹子。"],
    banker: ["The banker explained the loan to us.", "那位銀行家向我們說明了貸款內容。"],
    basics: ["We need to learn the basics first.", "我們需要先學好基礎。"],
    basis: ["Trust is the basis of friendship.", "信任是友誼的基礎。"],
    bead: ["She put a red bead on the string.", "她把一顆紅色珠子串在線上。"],
    conversation: ["We had a long conversation after class.", "我們下課後聊了很久。"],
    count: ["Let’s count the stars together.", "我們一起數星星吧。"],
    garbage: ["Please take the garbage out after dinner.", "請在晚餐後把垃圾拿出去。"],
    heat: ["The summer heat made everyone tired.", "夏天的熱氣讓大家都很累。"],
    sailor: ["The sailor waved at us from the boat.", "那位水手在船上向我們揮手。"],
    sixty: ["There are sixty students in the hall.", "禮堂裡有六十位學生。"],
    yucky: ["The spoiled milk smelled yucky.", "那瓶壞掉的牛奶聞起來很噁心。"],
    yummy: ["The cookies tasted yummy.", "那些餅乾吃起來很好吃。"],
    airplane: ["The airplane flew over the city.", "那架飛機飛過城市上空。"],
    plane: ["The plane landed safely.", "飛機安全降落了。"],
  };
  if (map[key]) {
    const [english, chinese] = map[key];
    return `${english} (${chinese})`;
  }
  return "";
}

function classifyByMeaning(gloss) {
  if (hasAny(gloss, ["狗", "貓", "鳥", "魚", "鴨", "雞", "熊", "鹿", "獅", "虎", "猴", "猩猩", "螞蟻", "蜜蜂", "蝴蝶", "蟲", "駱駝", "大象", "鴿子", "牛", "馬", "豬", "羊", "兔", "狼", "鯨", "海豚"])) return "animal";
  if (hasAny(gloss, ["爸爸", "媽媽", "阿姨", "叔叔", "兄弟", "姐妹", "朋友", "老師", "學生", "演員", "理髮師", "保母", "銀行家", "助理", "藝術家", "警察", "人員", "水手", "球員", "歌手"])) return "person";
  if (hasAny(gloss, ["咖啡", "茶", "果汁", "牛奶", "水", "可樂", "汽水"])) return "drink";
  if (hasAny(gloss, ["麵包", "香蕉", "蛋糕", "糖果", "餅乾", "肉", "牛肉", "豬肉", "雞肉", "米", "玉米", "水果", "派", "披薩", "番茄", "蔬菜", "早餐", "晚餐", "杏仁"])) return "food";
  if (hasAny(gloss, ["店", "館", "局", "院", "場", "室", "台", "樓", "園", "街", "市", "國家", "橋", "海灘", "機場", "地下室", "陽台"])) return "place";
  if (hasAny(gloss, ["飛機", "巴士", "公車", "腳踏車", "汽車", "火車", "船", "卡車", "航空公司"])) return "transport";
  if (hasAny(gloss, ["手臂", "頭", "頭髮", "眼睛", "耳朵", "鼻子", "嘴巴", "肩膀", "腿", "腳", "腳踝", "骨頭", "臉", "牙齒", "舌頭", "喉嚨"])) return "body";
  if (hasAny(gloss, ["椅", "桌", "床", "櫃", "窗", "門", "鐘", "杯", "盤", "碗", "箱", "籃", "帽", "扇", "針", "枕", "球", "卡", "袋", "瓶", "相簿", "相冊", "專輯", "毛巾", "照片", "圖片", "地毯", "帳篷", "電話", "書櫃"])) return "object";
  if (hasAny(gloss, ["帽", "鞋", "裙", "褲", "衣", "外套", "襯衫", "皮帶", "襪", "手套", "圍裙"])) return "clothing";
  if (hasAny(gloss, ["黑色", "白色", "藍色", "紅色", "黃色", "綠色", "褐色", "粉色"])) return "color";
  if (hasAny(gloss, ["月", "星期", "春天", "夏天", "秋天", "冬天", "午後", "早上", "晚上", "昨天", "今天"])) return "time";
  if (hasAny(gloss, ["能力", "才能", "機會", "時間", "年齡", "答案", "行動", "幫助", "數量", "問題", "錯誤", "名字", "地址", "價格", "聲音", "愛", "希望", "基礎", "事情", "缺席"])) return "abstract";
  return "generic";
}

function generateFromMeaning(word, meaning, pos) {
  const surface = firstEnglishForm(word);
  const gloss = firstGloss(meaning) || "這個字";
  const special = exactExample(word) || exactExample(surface);
  if (special) return special;
  if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i.test(normalize(surface))) {
    return `There are ${surface} students in the room. (教室裡有${gloss}個學生。)`;
  }

  if (hasAny(gloss, ["在…之後"])) return `We went home after school. (我們放學後回家了。)`;
  if (hasAny(gloss, ["在…之前"])) return `Please finish your homework before dinner. (請在晚餐前完成作業。)`;
  if (hasAny(gloss, ["在…上面"])) return `The picture is above the sofa. (那幅畫在沙發上方。)`;
  if (hasAny(gloss, ["在…下面"])) return `The cat is below the chair. (那隻貓在椅子下面。)`;
  if (hasAny(gloss, ["在…旁邊"])) return `She sat beside her friend on the bus. (她在公車上坐在朋友旁邊。)`;
  if (hasAny(gloss, ["在…之中"])) return `He stood among his classmates. (他站在同學們之中。)`;
  if (hasAny(gloss, ["在…之間"])) return `The library is between the bank and the park. (圖書館在銀行和公園之間。)`;
  if (hasAny(gloss, ["沿著"])) return `We walked along the river after dinner. (我們晚餐後沿著河邊散步。)`;
  if (hasAny(gloss, ["對面"])) return `The bookstore is across the street. (書店在街道對面。)`;
  if (hasAny(gloss, ["根據"])) return `According to the teacher, the quiz is tomorrow. (根據老師的說法，小考在明天。)`;
  if (hasAny(gloss, ["出國", "海外"])) return `My sister hopes to study abroad someday. (我姐姐希望有一天能出國讀書。)`;
  if (hasAny(gloss, ["大聲"])) return `Please read the story aloud. (請大聲朗讀這個故事。)`;
  if (hasAny(gloss, ["積極", "活躍"])) return `The students are active in class. (學生們在課堂上很活躍。)`;
  if (hasAny(gloss, ["缺席"])) return `Her absence was noticed by the teacher. (老師注意到她缺席了。)`;
  if (hasAny(gloss, ["好吃", "美味", "可口"])) return `The cookies tasted ${surface}. (那些餅乾吃起來很${gloss}。)`;
  if (hasAny(gloss, ["噁心", "討厭"])) return `The old milk smelled ${surface}. (那瓶放太久的牛奶聞起來很${gloss}。)`;

  const category = classifyByMeaning(gloss);

  if (category === "animal") return `We saw ${articleFor(surface)} ${surface} at the zoo. (我們在動物園看到一隻${gloss}。)`;
  if (category === "drink") return `She drank some ${surface} after lunch. (她午餐後喝了一些${gloss}。)`;
  if (category === "food") return `I had ${surface} for breakfast. (我早餐吃了${gloss}。)`;
  if (category === "place") return `We went to the ${surface} after school. (我們放學後去了${gloss}。)`;
  if (category === "transport") return `We went there by ${surface}. (我們搭${gloss}去了那裡。)`;
  if (category === "person") return `The ${surface} smiled at everyone. (那位${gloss}對大家微笑。)`;
  if (category === "body") return `He hurt his ${surface} during the game. (他在比賽時弄傷了${gloss}。)`;
  if (category === "object") return `The ${surface} is near the window. (那個${gloss}在窗戶旁邊。)`;
  if (category === "clothing") return `I bought a new ${surface} yesterday. (我昨天買了一件新的${gloss}。)`;
  if (category === "color") return `The bag is ${surface}. (那個包包是${gloss}的。)`;
  if (category === "time") return `We will talk about it in ${surface}. (我們會在${gloss}談這件事。)`;
  if (category === "abstract") return `We talked about ${surface} in class. (我們在課堂上談到了${gloss}。)`;

  if (pos.includes("動詞")) {
    if (hasAny(gloss, ["說", "講", "讀", "唱", "問", "回答", "寫"])) {
      return `Please ${surface} the sentence slowly. (請慢慢地${gloss}這個句子。)`;
    }
    if (hasAny(gloss, ["來", "去", "走", "跑", "跳", "游", "飛", "到達"])) {
      return `The children ${surface} to the park after school. (孩子們放學後會${gloss}到公園。)`;
    }
    if (hasAny(gloss, ["加", "放", "拿", "帶", "開", "關", "切", "煮", "洗", "畫", "做", "看", "聽", "買"])) {
      return `Please ${surface} it carefully. (請小心地${gloss}它。)`;
    }
    return `We ${surface} every day at school. (我們每天在學校都會${gloss}。)`;
  }

  if (pos.includes("形容詞")) {
    return `The answer seems ${surface}. (這個答案似乎${gloss}。)`;
  }

  if (pos.includes("副詞")) {
    return `Please use the word "${surface}" in a short sentence. (請用「${surface}」造一個短句。)`;
  }

  if (pos.includes("介系詞")) {
    return `We used "${surface}" in a simple sentence. (我們在句子裡用了「${surface}」這個介系詞。)`;
  }

  if (pos.includes("連接詞")) {
    return `I was tired, but I still finished my homework. (我雖然累了，但還是完成了作業。)`;
  }

  if (pos.includes("代名詞") || pos.includes("限定詞") || pos.includes("冠詞")) {
    return `This is a simple sentence with "${surface}". (這是一個帶有「${surface}」的簡單句子。)`;
  }

  return `The teacher gave us an example with "${surface}". (老師給了我們一個使用「${surface}」的例子。)`;
}

async function importWorkbook(filePath) {
  const blob = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(blob);
}

async function main() {
  await fs.copyFile(workbookPath, backupPath);

  const workbook = await importWorkbook(workbookPath);
  const posMap = new Map(Object.entries(JSON.parse(await fs.readFile(posMapPath, "utf8"))));
  const summary = [];

  for (const sheetName of ["Level 1", "Level 2"]) {
    const sheet = workbook.worksheets.getItem(sheetName);
    const values = sheet.getUsedRange().values;
    const lastRow = values.length;
    const newExamples = [];
    let fromExisting = 0;
    let generated = 0;

    for (let rowIndex = 1; rowIndex < lastRow; rowIndex += 1) {
      const word = values[rowIndex]?.[1] ?? "";
      const meaning = values[rowIndex]?.[2] ?? "";
      const oldExample = values[rowIndex]?.[3] ?? "";
      let example = "";

      if (oldExample) {
        example = rewriteExistingExample(oldExample, rowIndex);
        fromExisting += 1;
      }
      if (!example) {
        const pos =
          posMap.get(normalize(firstEnglishForm(word))) ||
          posMap.get(normalize(word)) ||
          "";
        example = generateFromMeaning(word, meaning, pos);
        generated += 1;
      }

      newExamples.push([example]);
    }

    sheet.getRange("E1").values = [["新例句"]];
    sheet.getRange("E1").format = {
      fill: "#1F4E78",
      font: { bold: true, color: "#FFFFFF" },
    };
    sheet.getRange(`E2:E${lastRow}`).values = newExamples;
    sheet.getRange(`E1:E${lastRow}`).format.borders = {
      preset: "all",
      style: "thin",
      color: "#D9E2F3",
    };
    sheet.getRange(`E1:E${lastRow}`).format.wrapText = true;
    sheet.getRange(`E1:E${lastRow}`).format.columnWidthPx = 640;

    summary.push({ sheetName, fromExisting, generated });
  }

  const inspect = await workbook.inspect({
    kind: "table",
    range: "Level 1!A1:E12",
    include: "values",
    tableMaxRows: 12,
    tableMaxCols: 5,
  });
  console.log(inspect.ndjson);
  console.log(JSON.stringify(summary));

  const preview = await workbook.render({
    sheetName: "Level 1",
    range: "A1:E18",
    scale: 1.15,
    format: "png",
  });
  await fs.writeFile(
    path.join(repoRoot, "outputs", "level1_l1l2_e_preview.png"),
    new Uint8Array(await preview.arrayBuffer()),
  );

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(workbookPath);

  console.log(workbookPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
