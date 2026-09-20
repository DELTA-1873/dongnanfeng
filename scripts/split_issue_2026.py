#!/usr/bin/env python3
"""Split the 2026 two-page-spread magazine into article PDFs and metadata."""

from copy import copy
from pathlib import Path
import json
import shutil

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "26社刊 A5.pdf"
ISSUE_DIR = ROOT / "dist" / "magazines" / "2026"
ARTICLE_DIR = ISSUE_DIR / "articles"

ARTICLES = [
    {"slug": "song", "title": "东南风起时", "author": "石刚、郝辰欣", "category": "社歌", "start": 1, "end": 1},
    {"slug": "preface-future", "title": "东南有风，未来可期", "author": "张娟", "category": "卷首语", "start": 2, "end": 3},
    {"slug": "once-a-while", "title": "一期一会", "author": "尉思懿", "category": "卷首语", "start": 4, "end": 4},
    {"slug": "ten-years", "title": "风从此间起", "author": "东南风工作组", "category": "影像辑录", "start": 10, "end": 19},
    {"slug": "reading-list", "title": "风从书页来", "author": "东南风社员", "category": "书单", "start": 20, "end": 29},
    {"slug": "structure-or-content", "title": "结构 or 内容，谁更重要？", "author": "蔡佳辰", "category": "评论", "start": 30, "end": 36},
    {"slug": "xiaoling-autumn", "title": "孝陵观秋", "author": "邹昊轩", "category": "散文", "start": 38, "end": 44},
    {"slug": "essay-event", "title": "随笔写作活动简介", "author": "东南风工作组", "category": "活动", "start": 45, "end": 45},
    {"slug": "tunnel-end", "title": "隧道已尽", "author": "雾攸", "category": "散文", "start": 46, "end": 47},
    {"slug": "winter-chapter", "title": "冬章", "author": "孙睿妍", "category": "散文", "start": 48, "end": 50},
    {"slug": "rewind", "title": "倒带", "author": "巫见", "category": "小说", "start": 51, "end": 59},
    {"slug": "elephant-slide", "title": "中原大象滑梯消亡实录", "author": "巫见", "category": "小说", "start": 60, "end": 69},
    {"slug": "chance", "title": "偶然", "author": "巫见", "category": "小说", "start": 70, "end": 87},
    {"slug": "rain-after-fifty-million-minutes", "title": "五千万分钟后下雨", "author": "海市", "category": "小说", "start": 88, "end": 95},
    {"slug": "tropic-of-cancer", "title": "雨还在下", "author": "参显", "category": "小说", "start": 96, "end": 110},
    {"slug": "red-leaf", "title": "红叶", "author": "子玉", "category": "小说", "start": 111, "end": 117},
    {"slug": "kill-sasha", "title": "杀死萨沙", "author": "陈年老尸", "category": "小说", "start": 118, "end": 119},
    {"slug": "ai-writing-event", "title": "AI 写作活动简介", "author": "东南风工作组", "category": "活动", "start": 120, "end": 120},
    {"slug": "escape-in-fiction", "title": "虚构下的遁逃", "author": "拾蓱", "category": "小说", "start": 121, "end": 125},
    {"slug": "osmanthus-path", "title": "桂花小径（外二首）", "author": "任绪成", "category": "诗歌", "start": 126, "end": 128},
    {"slug": "cleaning-two", "title": "大扫除 II", "author": "街", "category": "诗歌", "start": 129, "end": 131},
    {"slug": "polar-bear-rice-sauce", "title": "冰熊拌饭酱（YEars）", "author": "俞之汜", "category": "诗歌", "start": 132, "end": 132},
    {"slug": "shadow", "title": "影子", "author": "参显", "category": "诗歌", "start": 133, "end": 133},
    {"slug": "sail", "title": "帆", "author": "拾蓱", "category": "诗歌", "start": 134, "end": 134},
    {"slug": "last-love-poem", "title": "最后一首情诗", "author": "雾攸", "category": "诗歌", "start": 135, "end": 135},
    {"slug": "many-years-before", "title": "此前许多年", "author": "雾攸", "category": "诗歌", "start": 136, "end": 136},
    {"slug": "scale-window", "title": "鳞窗", "author": "雾攸", "category": "诗歌", "start": 137, "end": 137},
    {"slug": "bad-ending", "title": "坏结局", "author": "安格丽卡", "category": "诗歌", "start": 138, "end": 139},
    {"slug": "magpie-spring", "title": "惊鹊·上巳人间", "author": "拾蓱", "category": "诗歌", "start": 140, "end": 143},
    {"slug": "toward-bianjing", "title": "向汴京奔去", "author": "明和", "category": "诗歌", "start": 144, "end": 146},
    {"slug": "old-temple", "title": "泛咏古庙陵", "author": "薯片塔居士", "category": "诗歌", "start": 147, "end": 147},
    {"slug": "garden-sitting", "title": "沁园春·记闲坐观小园", "author": "画心玲珑", "category": "诗歌", "start": 147, "end": 147},
    {"slug": "mr-wuwei-poems", "title": "无为先生诗选", "author": "无为先生", "category": "诗歌", "start": 148, "end": 149},
    {"slug": "unrepeatable-life", "title": "诗境下无可复刻的生命", "author": "画心玲珑", "category": "评论", "start": 150, "end": 153},
    {"slug": "society-history", "title": "东南风文学社社史", "author": "孟子涵、东南风工作组", "category": "社史", "start": 154, "end": 161},
]


def printed_page(reader: PdfReader, number: int):
    """Return one portrait printed page cropped from a landscape PDF spread."""
    source_index = number // 2 + 2
    page = copy(reader.pages[source_index])
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
            "/Subject": "东南风文学社 2026 年刊",
        })
        output = ARTICLE_DIR / f'{article["slug"]}.pdf'
        with output.open("wb") as stream:
            writer.write(stream)
        record = dict(article)
        record["file"] = f'./magazines/2026/articles/{article["slug"]}.pdf'
        record["page_count"] = article["end"] - article["start"] + 1
        record["file_size"] = output.stat().st_size
        metadata.append(record)

    shutil.copy2(SOURCE, ISSUE_DIR / "dongnanfeng-2026.pdf")
    (ISSUE_DIR / "articles.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Created {len(metadata)} article PDFs in {ARTICLE_DIR}")


if __name__ == "__main__":
    main()
