#!/usr/bin/env python3
"""Split the 2025 two-page-spread magazine into article PDFs and metadata."""

from copy import copy
from pathlib import Path
import json
import shutil

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "25社刊.pdf"
ISSUE_DIR = ROOT / "dist" / "magazines" / "2025"
ARTICLE_DIR = ISSUE_DIR / "articles"

ARTICLES = [
    {"slug": "song", "title": "东南风起时", "author": "石刚、郝辰欣", "category": "社歌", "start": 1, "end": 1},
    {"slug": "preface-future", "title": "东南有风，未来可期", "author": "张娟", "category": "卷首语", "start": 2, "end": 3},
    {"slug": "once-a-while", "title": "一期一会", "author": "尉思懿", "category": "卷首语", "start": 4, "end": 9},
    {"slug": "timely-and-moving", "title": "时者——任是无情也动人", "author": "初见", "category": "评论", "start": 10, "end": 13},
    {"slug": "dream", "title": "梦", "author": "左月", "category": "散文", "start": 14, "end": 16},
    {"slug": "individual-and-political", "title": "关于人的个体性与政治性问题的演讲", "author": "盲莽、安格丽卡", "category": "评论", "start": 17, "end": 21},
    {"slug": "today-matters", "title": "今朝事", "author": "林雨", "category": "散文", "start": 22, "end": 25},
    {"slug": "existential-mcdonalds", "title": "存在主义麦当劳", "author": "觋", "category": "散文", "start": 26, "end": 30},
    {"slug": "they-raised-a-cat", "title": "他们养了一只猫", "author": "拉南杰", "category": "小说", "start": 31, "end": 33},
    {"slug": "hadas-hanging", "title": "哈达的自缢", "author": "拉南杰", "category": "小说", "start": 34, "end": 42},
    {"slug": "encore-zero", "title": "encore「0」", "author": "射日户山橙", "category": "小说", "start": 43, "end": 47},
    {"slug": "north-wind-like-blood", "title": "北风如血", "author": "吴榜", "category": "小说", "start": 48, "end": 51},
    {"slug": "oppressive-moments", "title": "压抑的时刻们", "author": "朱庭轩", "category": "小说", "start": 52, "end": 55},
    {"slug": "twelve-equals-zero", "title": "12 = 0", "author": "安格丽卡", "category": "小说", "start": 56, "end": 64},
    {"slug": "kaishi-zen", "title": "开事禅", "author": "彭金泽", "category": "诗词", "start": 65, "end": 68},
    {"slug": "mulberries-west-lake", "title": "采桑子·宝石山望西湖", "author": "施韵东", "category": "诗词", "start": 69, "end": 69},
    {"slug": "tashaxing-xitang", "title": "踏莎行·西塘汉服节", "author": "施韵东", "category": "诗词", "start": 69, "end": 69},
    {"slug": "yongyule-years", "title": "永遇乐（岁月如梭）", "author": "徐思哲", "category": "诗词", "start": 69, "end": 69},
    {"slug": "water-wind", "title": "水风集（三首）", "author": "林染", "category": "诗词", "start": 70, "end": 70},
    {"slug": "autumn-moon", "title": "秋月", "author": "陈玺鸣", "category": "诗词", "start": 70, "end": 70},
    {"slug": "jade-tower-spring", "title": "玉楼春（三首）", "author": "施韵东", "category": "诗词", "start": 71, "end": 71},
    {"slug": "wind-enters-pines-summer", "title": "风入松·夏", "author": "吉他", "category": "诗词", "start": 72, "end": 72},
    {"slug": "hexinlang-graduation", "title": "贺新郎·毕业前游观澜亭有感", "author": "吉他", "category": "诗词", "start": 73, "end": 73},
    {"slug": "devils-day", "title": "魔鬼日", "author": "街", "category": "诗歌", "start": 75, "end": 75},
    {"slug": "late-night-metro", "title": "深夜地铁", "author": "盲莽", "category": "诗歌", "start": 76, "end": 76},
    {"slug": "low-battery", "title": "电量低", "author": "安格丽卡", "category": "诗歌", "start": 77, "end": 78},
    {"slug": "ark-blue-whale", "title": "方舟蓝鲸号", "author": "俞之汜", "category": "诗歌", "start": 79, "end": 82},
    {"slug": "rest-in-a-cup", "title": "杯中小憩", "author": "龙朝洋", "category": "诗歌", "start": 83, "end": 84},
    {"slug": "rescued-oisin", "title": "被拯救的奥伊辛", "author": "李明瑞", "category": "诗歌", "start": 85, "end": 88},
    {"slug": "sky-burial", "title": "天葬", "author": "拉南杰", "category": "诗歌", "start": 89, "end": 89},
    {"slug": "same-symbol", "title": "我以一个同样的符号面对", "author": "拉南杰", "category": "诗歌", "start": 89, "end": 91},
    {"slug": "cat-physics", "title": "猫猫物理学", "author": "盲莽", "category": "诗歌", "start": 92, "end": 93},
    {"slug": "use-of-uselessness", "title": "无用之用", "author": "杨晴晴", "category": "卷末语", "start": 94, "end": 95},
    {"slug": "from-the-sea", "title": "从海水中来", "author": "白乙程", "category": "卷末语", "start": 96, "end": 97},
    {"slug": "society-history", "title": "东南风文学社社史——兼文化类社团简史", "author": "孟子涵、东南风工作组", "category": "社史", "start": 98, "end": 105},
]


def printed_page(reader: PdfReader, number: int):
    """Return one printed page; page 1 is a full landscape design, later pages are spread halves."""
    source_index = number // 2 + 2
    page = copy(reader.pages[source_index])
    if number == 1:
        return page
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    half = width / 2
    if number % 2:
        page.add_transformation(Transformation().translate(tx=-half, ty=0))
    box = RectangleObject([0, 0, half, height])
    page.mediabox = box
    page.cropbox = RectangleObject([0, 0, half, height])
    page.trimbox = RectangleObject([0, 0, half, height])
    page.bleedbox = RectangleObject([0, 0, half, height])
    page.artbox = RectangleObject([0, 0, half, height])
    return page


def main():
    ARTICLE_DIR.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(SOURCE)
    metadata = []
    for article in ARTICLES:
        writer = PdfWriter()
        for number in range(article["start"], article["end"] + 1):
            writer.add_page(printed_page(reader, number))
        writer.add_metadata({
            "/Title": article["title"],
            "/Author": article["author"],
            "/Subject": "东南风文学社 2025 年刊",
        })
        output = ARTICLE_DIR / f'{article["slug"]}.pdf'
        with output.open("wb") as stream:
            writer.write(stream)
        record = dict(article)
        record["file"] = f'./magazines/2025/articles/{article["slug"]}.pdf'
        record["page_count"] = article["end"] - article["start"] + 1
        record["file_size"] = output.stat().st_size
        metadata.append(record)

    shutil.copy2(SOURCE, ISSUE_DIR / "dongnanfeng-2025.pdf")
    (ISSUE_DIR / "articles.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Created {len(metadata)} article PDFs in {ARTICLE_DIR}")


if __name__ == "__main__":
    main()
