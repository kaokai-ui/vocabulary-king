const WORD_LIST_CREDITS = {
  "zh-TW": {
    title: "我們的單字從哪裡來？",
    intro: "考試辭庫的選字，是以學者公開發表、依大量真實英文統計出來的字表為基礎，再依出現頻率分級。",
    sources: [
      ["NGSL（New General Service List，新通用字彙表）", "一般英文最常用的約 2,800 個字。研究者從超過 2.7 億字的現代英文語料中統計選出，學會這些字，大約能看懂一般英文文章 92% 的用字。"],
      ["TSL（TOEIC Service List，多益字彙表）", "約 1,250 個多益特別常見、但不在 NGSL 裡的字。NGSL 加上 TSL，大約涵蓋多益考題 98% 的用字。"],
      ["BSL（Business Service List，商務字彙表）", "約 1,700 個商務英文常用字，來自商務文件語料，適合職場與多益進階。"],
      ["NAWL（New Academic Word List，新學術字表）", "約 960 個學術英文常用字，來自期刊論文、教科書與大學課堂講課的語料。"],
      ["詞頻表", "NGSL 計畫另外公開約 3 萬字的英文詞頻表。我們用它決定其他單字的難易順序：越常見的字排在越前面的等級。"]
    ],
    written: "所有例句、中文意思和日韓翻譯都是我們自己編寫、逐筆審校的內容。",
    attributionTitle: "出處與授權",
    attribution: "NGSL 1.2、TSL 1.2、BSL 1.20、NAWL 1.2 與 NGSL 詞頻表由 Charles Browne、Brent Culligan、Joseph Phillips 編製，",
    pronunciation: "發音（音標）使用 Carnegie Mellon University 的 CMU Pronouncing Dictionary（BSD 授權）。",
    school: "國小、國中、高中辭庫的分級參考教育部國中小基本字彙與大考中心高中英文參考詞彙表。",
    shared: "本 App 依上述字表整理的選字清單，以 CC BY-SA 4.0 授權提供。",
    trademarkTitle: "商標聲明：",
    trademark: "TOEIC、TOEFL 是 ETS 的註冊商標；IELTS 由 British Council、IDP: IELTS Australia 與 Cambridge University Press & Assessment 共同擁有；GEPT（全民英檢）是語言訓練測驗中心的商標。本 App 與上述機構無關，也未經其認可。"
  },
  en: {
    title: "Where do our words come from?",
    intro: "The exam word lists are built on research-based lists compiled from large collections of real English and published openly by their authors. Words are grouped into levels by how often they occur.",
    sources: [
      ["NGSL (New General Service List)", "About 2,800 of the most useful words in general English, chosen from a corpus of over 270 million words. Knowing them covers about 92% of the words in typical English texts."],
      ["TSL (TOEIC Service List)", "About 1,250 words frequent in TOEIC preparation materials but not in the NGSL. NGSL and TSL together cover about 98% of the words in TOEIC tests."],
      ["BSL (Business Service List)", "About 1,700 high-frequency business English words, selected from business documents."],
      ["NAWL (New Academic Word List)", "About 960 words frequent in academic English, including journals, textbooks, and lectures."],
      ["Frequency list", "The NGSL project's 31,000-word frequency list orders other words from more to less common."]
    ],
    written: "All example sentences, meanings, and Japanese and Korean translations are written and reviewed by us.",
    attributionTitle: "Credits and license",
    attribution: "NGSL 1.2, TSL 1.2, BSL 1.20, NAWL 1.2, and the NGSL frequency list were compiled by Charles Browne, Brent Culligan, and Joseph Phillips; project details are at",
    pronunciation: "Pronunciations use the CMU Pronouncing Dictionary by Carnegie Mellon University (BSD license).",
    school: "School vocabulary levels refer to Taiwan's Ministry of Education elementary and junior-high lists and the College Entrance Examination Center senior-high reference list.",
    shared: "Our word selection derived from the lists above is shared under CC BY-SA 4.0.",
    trademarkTitle: "Trademark notice: ",
    trademark: "TOEIC and TOEFL are registered trademarks of ETS. IELTS is jointly owned by the British Council, IDP: IELTS Australia, and Cambridge University Press & Assessment. GEPT is a trademark of the Language Training and Testing Center. This app is not affiliated with or endorsed by these organizations."
  }
};

export default function WordListCredits({ locale }) {
  const copy = locale === "zh-TW" ? WORD_LIST_CREDITS["zh-TW"] : WORD_LIST_CREDITS.en;
  return (
    <div className="word-list-credits__body">
      <h3>{copy.title}</h3>
      <p>{copy.intro}</p>
      <ul>
        {copy.sources.map(([name, description]) => (
          <li key={name}><strong>{name}</strong> — {description}</li>
        ))}
      </ul>
      <p>{copy.written}</p>
      <h3>{copy.attributionTitle}</h3>
      <p>
        {copy.attribution}
        <a href="https://www.newgeneralservicelist.com/" target="_blank" rel="noreferrer">newgeneralservicelist.com</a>
        {" "}
        {locale === "zh-TW" ? "，授權為 " : ". Licensed under "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
      </p>
      <p>{copy.pronunciation}</p>
      <p>{copy.school}</p>
      <p>{copy.shared}</p>
      <p><strong>{copy.trademarkTitle}</strong>{copy.trademark}</p>
    </div>
  );
}
