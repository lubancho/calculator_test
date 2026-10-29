"""
Генерация примеров коммерческих предложений в папку examples/.
PDF создаются через интерфейс калькулятора (нажатие «Скачать PDF для клиента»),
поэтому суммы в примерах — это ровно то, что посчитало приложение.

Запуск из корня проекта:  python tests/make_examples.py
"""
import re
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "examples"
OUT.mkdir(exist_ok=True)

EXAMPLES = [
    ("01_Landing_zayavki_CRM", "Лендинг для сбора заявок с передачей в CRM",
     dict(ptype="landing", pages=1, features=("form", "crm"), urgency="standard")),
    ("02_Landing_srochnyi_promo", "Срочный промо-лендинг под рекламную кампанию",
     dict(ptype="landing", pages=3, features=("form",), urgency="urgent")),
    ("03_Corporate_site", "Корпоративный сайт на двух языках с формой и CRM",
     dict(ptype="corporate", pages=12, features=("form", "crm", "multilingual"), urgency="standard")),
    ("04_Internet_magazin", "Интернет-магазин с каталогом и онлайн-оплатой, ускоренно",
     dict(ptype="shop", pages=25, features=("catalog", "payment", "crm"), urgency="fast")),
]


def plain(s):
    return re.sub(r"[  ]", " ", s or "")


def main():
    summary = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(accept_downloads=True)
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_selector("#calculator-app[data-ready=true]")
        for slug, title, sc in EXAMPLES:
            page.click("#btn-reset")
            page.check(f"input[name=projectType][value={sc['ptype']}]")
            page.fill("#pages-input", str(sc["pages"]))
            page.press("#pages-input", "Enter")
            for f in sc["features"]:
                page.check(f"input[name=features][value={f}]")
            page.check(f"input[name=urgency][value={sc['urgency']}]")
            price = plain(page.text_content("#total-price"))
            days = plain(page.text_content("#total-duration"))
            with page.expect_download() as d:
                page.click("#btn-pdf")
            target = OUT / f"KP_{slug}.pdf"
            d.value.save_as(target)
            page.wait_for_function("document.getElementById('btn-pdf').getAttribute('aria-busy') === 'false'")
            text = plain(subprocess.run(["pdftotext", str(target), "-"], capture_output=True, text=True).stdout)
            assert price in text and days in text, f"{slug}: PDF не совпадает с экраном"
            summary.append((target.name, title, price, days))
            print(f"{target.name}: {price}, {days}")
        browser.close()
    return summary


if __name__ == "__main__":
    main()
