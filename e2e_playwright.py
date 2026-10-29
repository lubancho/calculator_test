"""
Сквозные (E2E) проверки интерфейса и PDF в Chromium через Playwright.

Запуск из корня проекта:
    pip install playwright && python -m playwright install chromium
    python tests/e2e_playwright.py [папка_для_отчёта]

Нужен pdftotext (poppler-utils) для проверки текста внутри PDF.
Страница открывается и по file:// (без сервера), и через локальный HTTP-сервер.
"""
import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tests" / "_report"
OUT.mkdir(parents=True, exist_ok=True)

results = []


def check(name, cond, detail=""):
    results.append({"name": name, "ok": bool(cond), "detail": detail})
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail and not cond else ""))


def plain(s):
    return re.sub(r"[  ]", " ", s or "")


def start_server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = lambda *a, **k: Quiet(*a, directory=str(ROOT), **k)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def ui_total(page):
    return plain(page.text_content("#total-price")), plain(page.text_content("#total-duration"))


def set_scenario(page, ptype, pages=None, features=(), urgency="standard"):
    page.click("#btn-reset")
    page.check(f"input[name=projectType][value={ptype}]")
    if pages is not None:
        page.fill("#pages-input", str(pages))
        page.press("#pages-input", "Enter")
    for f in features:
        page.check(f"input[name=features][value={f}]")
    page.check(f"input[name=urgency][value={urgency}]")


def pdf_text(path):
    return plain(subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True).stdout)


def pdf_pages(path):
    out = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True).stdout
    m = re.search(r"Pages:\s+(\d+)", out)
    return int(m.group(1)) if m else 0


def download_pdf(page, name):
    with page.expect_download(timeout=20000) as d:
        page.click("#btn-pdf")
    target = OUT / name
    d.value.save_as(target)
    page.wait_for_function("document.getElementById('btn-pdf').getAttribute('aria-busy') === 'false'")
    return target, d.value.suggested_filename


SCENARIOS = [
    ("TC-01", dict(ptype="landing", pages=1), "35 000 ₽", "7 рабочих дней"),
    ("TC-02", dict(ptype="corporate", pages=8), "92 000 ₽", "18 рабочих дней"),
    ("TC-03", dict(ptype="landing", features=("form", "crm")), "55 000 ₽", "11 рабочих дней"),
    ("TC-04", dict(ptype="shop", pages=10, urgency="fast"), "180 000 ₽", "20 рабочих дней"),
    ("TC-05", dict(ptype="corporate", pages=1), "80 000 ₽", "15 рабочих дней"),
    ("TC-06", dict(ptype="landing", pages=1, urgency="urgent"), "49 000 ₽", "5 рабочих дней"),
    ("TC-07", dict(ptype="corporate", pages=8, features=("crm",), urgency="fast"), "128 400 ₽", "17 рабочих дней"),
    ("TC-08", dict(ptype="landing", pages=2, features=("form", "catalog", "payment", "crm", "multilingual")), "125 000 ₽", "23 рабочих дня"),
]


def main():
    httpd, base = start_server()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- 0. Открытие через file:// (без сервера) ----------
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto((ROOT / "index.html").as_uri())
        page.wait_for_selector("#calculator-app[data-ready=true]")
        check("file:// — приложение запускается", ui_total(page) == ("35 000 ₽", "7 рабочих дней"), str(ui_total(page)))
        page.check("input[name=projectType][value=corporate]")
        page.fill("#pages-input", "8"); page.press("#pages-input", "Enter")
        page.check("input[name=features][value=crm]"); page.check("input[name=urgency][value=fast]")
        path, _ = download_pdf(page, "file-protocol.pdf")
        check("file:// — PDF формируется без сервера", "128 400 ₽" in pdf_text(path))
        check("file:// — нет ошибок JS", not errors, "; ".join(errors))
        ctx.close()

        # ---------- Основной контекст через HTTP ----------
        ctx = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 900})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=base.rstrip("/"))
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        requests = []
        page.on("request", lambda r: requests.append(r.url))
        page.goto(base + "index.html")
        page.wait_for_selector("#calculator-app[data-ready=true]")

        # 1. Приёмочные сценарии через интерфейс
        for tc, sc, price, days in SCENARIOS:
            set_scenario(page, sc["ptype"], sc.get("pages"), sc.get("features", ()), sc.get("urgency", "standard"))
            got = ui_total(page)
            check(f"{tc} в интерфейсе: {price}, {days}", got == (price, days), str(got))
            check(f"{tc} итог в таблице = крупной сумме", plain(page.text_content("#bd-total")) == price)

        # 2. Пример детализации и пояснения из ТЗ
        set_scenario(page, "corporate", 8)
        bd = [plain(page.text_content(s)) for s in ["#bd-base", "#bd-pages", "#bd-features", "#bd-urgency", "#bd-total"]]
        check("Детализация корп. 8 стр. как в ТЗ", bd == ["80 000 ₽", "12 000 ₽", "0 ₽", "0 ₽", "92 000 ₽"], str(bd))
        check("Пояснение как в ТЗ", plain(page.text_content("#explanation")) ==
              "Выбран корпоративный сайт на 8 страниц. В базовую стоимость включено 5 страниц, поэтому дополнительно рассчитаны 3 страницы. Дополнительные функции не выбраны. Проект выполняется в стандартные сроки.",
              plain(page.text_content("#explanation")))
        check("«Дополнительные функции не выбраны» в детализации", "Дополнительные функции не выбраны" in plain(page.text_content("#bd-features-note")))

        # 3. Смена типа сайта ставит включённые страницы, остальное сохраняется
        page.click("#btn-reset")
        page.check("input[name=features][value=form]"); page.check("input[name=urgency][value=urgent]")
        page.check("input[name=projectType][value=shop]")
        check("Смена типа: страницы = 10", page.input_value("#pages-input") == "10")
        check("Смена типа: функции и срочность сохранены",
              page.is_checked("input[name=features][value=form]") and page.is_checked("input[name=urgency][value=urgent]"))

        # 4. Граничные значения страниц
        page.click("#btn-reset"); page.check("input[name=projectType][value=corporate]")
        for raw, exp in [("0", "1"), ("-5", "1"), ("2.5", "3"), ("7,2", "7"), ("101", "100"), ("abc", "100")]:
            page.fill("#pages-input", raw); page.locator("#pages-input").blur()
            check(f"Ввод «{raw}» → {exp}", page.input_value("#pages-input") == exp, page.input_value("#pages-input"))
        check("Сообщение о коррекции показано", len(page.text_content("#pages-message")) > 0)
        page.fill("#pages-input", ""); page.locator("#pages-input").blur()
        check("Очистка поля восстанавливает прошлое значение", page.input_value("#pages-input") == "100")
        # Промежуточное значение не блокируется: при наборе «12» поле не перезаписывается после «1»
        page.fill("#pages-input", ""); page.type("#pages-input", "12")
        check("Набор «12» не блокируется", page.input_value("#pages-input") == "12")
        page.press("#pages-input", "Enter")
        check("12 стр. корп. = 108 000 ₽", ui_total(page)[0] == "108 000 ₽", ui_total(page)[0])
        page.fill("#pages-input", "100"); page.press("#pages-input", "Enter"); page.click("#pages-inc", force=True)
        check("«+» не превышает 100", page.input_value("#pages-input") == "100")
        page.fill("#pages-input", "1"); page.press("#pages-input", "Enter"); page.click("#pages-dec", force=True)
        check("«−» не опускается ниже 1", page.input_value("#pages-input") == "1")
        check("Пояснение «включено до 5 страниц»", "включено до 5 страниц" in plain(page.text_content("#bd-pages-note")))

        # 5. Многократное переключение чекбоксов и срочности
        page.click("#btn-reset")
        for _ in range(7):
            page.click("label:has(input[value=crm])")
        check("7 кликов по CRM → включён один раз: 50 000 ₽", ui_total(page)[0] == "50 000 ₽", ui_total(page)[0])
        for _ in range(7):
            page.click("label:has(input[value=crm])")
        check("Ещё 7 кликов → выключен: 35 000 ₽", ui_total(page)[0] == "35 000 ₽")
        for u in ["fast", "urgent", "standard", "urgent", "fast", "standard", "urgent"]:
            page.check(f"input[name=urgency][value={u}]")
        check("Переключение срочности без накопления: 49 000 ₽", ui_total(page) == ("49 000 ₽", "5 рабочих дней"), str(ui_total(page)))

        # 6. Сброс
        set_scenario(page, "shop", 40, ("payment", "catalog"), "fast")
        page.click("#btn-reset")
        check("Сброс → 35 000 ₽ и 7 дней", ui_total(page) == ("35 000 ₽", "7 рабочих дней"))
        check("Сброс → лендинг, 1 стр., без функций, стандарт",
              page.is_checked("input[value=landing]") and page.input_value("#pages-input") == "1"
              and page.locator("input[name=features]:checked").count() == 0 and page.is_checked("input[value=standard]"))

        # 7. Копирование (дважды)
        set_scenario(page, "corporate", 8, ("crm",), "fast")
        for i in range(2):
            page.click("#btn-copy")
            page.wait_for_function("document.getElementById('toast').textContent === 'Расчёт скопирован'")
            clip = plain(page.evaluate("navigator.clipboard.readText()"))
            check(f"Копирование #{i + 1}: уведомление и текст", "Итоговая стоимость: 128 400 ₽" in clip and "17 рабочих дней" in clip)
        (OUT / "copied.txt").write_text(clip, encoding="utf-8")

        # 8. Резервное копирование, если буфер недоступен
        page.evaluate("""() => {
          navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
          document.execCommand = () => false;
        }""")
        page.click("#btn-copy")
        page.wait_for_selector("#copy-fallback:not([hidden])")
        sel = page.evaluate("(() => { const t = document.getElementById('copy-fallback-text'); return t.selectionEnd - t.selectionStart === t.value.length && t.value.length > 100; })()")
        check("Отказ буфера → видимое поле с выделенным текстом", sel)
        check("Отказ буфера → сообщение об ошибке", "Не удалось" in page.text_content("#toast"))
        page.click("#copy-fallback-close")

        # 9. PDF: базовый расчёт
        page.click("#btn-reset")
        path, fname = download_pdf(page, "pdf-basic.pdf")
        t = pdf_text(path)
        check("PDF имя файла Website_Estimate_YYYY-MM-DD.pdf", re.fullmatch(r"Website_Estimate_\d{4}-\d{2}-\d{2}\.pdf", fname) is not None, fname)
        check("PDF базовый: заголовок, 35 000 ₽, 7 дней", "ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА РАЗРАБОТКИ САЙТА" in t and "35 000 ₽" in t and "7 рабочих дней" in t)
        check("PDF базовый: «Дополнительные функции не выбраны»", "Дополнительные функции не выбраны" in t)
        check("PDF базовый: нет строки наценки и допстраниц", "выполнение" not in t and "Дополнительные страницы" not in t)
        check("PDF номер EST-YYYYMMDD-HHMMSS", re.search(r"EST-\d{8}-\d{6}", t) is not None)
        check("PDF: примечание об оферте", "не является публичной офертой" in t)

        # 10. PDF: TC-07 — совпадение с экраном
        set_scenario(page, "corporate", 8, ("crm",), "fast")
        screen = ui_total(page)
        path, _ = download_pdf(page, "pdf-tc07.pdf")
        t = pdf_text(path)
        for s in ["Разработка корпоративного сайта (включено 5 страниц)", "12 000 ₽", "Интеграция с CRM", "15 000 ₽",
                  "Ускоренное выполнение (+20%)", "21 400 ₽", "128 400 ₽", "17 рабочих дней", "Ускоренная"]:
            check(f"PDF TC-07 содержит «{s}»", s in t)
        check("PDF TC-07: сумма и срок = экран", screen[0] in t and screen[1] in t)

        # 11. PDF: все функции, макс. страницы, срочный
        set_scenario(page, "shop", 100, ("form", "catalog", "payment", "crm", "multilingual"), "urgent")
        screen = ui_total(page)
        path, _ = download_pdf(page, "pdf-all-features.pdf")
        t = pdf_text(path)
        check("PDF все функции: итог = экран", screen[0] in t and screen[1] in t, str(screen))
        check("PDF все функции: 5 функций перечислены",
              all(n in t for n in ["Форма заявки", "Каталог товаров/услуг", "Онлайн-оплата", "Интеграция с CRM", "Мультиязычность"]))
        check("PDF все функции: строка 90 доп. страниц", re.search(r"Дополнительные страницы.*\s90\s", t) is not None)

        # 12. Длинные названия → перенос, многостраничность
        page.evaluate("""() => {
          const f = WebsiteCalculator.CONFIG.features;
          f.forEach((x, i) => x.name = x.name + ' — расширенная версия с индивидуальной настройкой, интеграцией со сторонними сервисами и подробной документацией для команды заказчика №' + (i + 1));
          WebsiteCalculator.CONFIG.agencyName = 'Digital Agency «Очень длинное название агентства для проверки переноса строк»';
        }""")
        page.click("#btn-reset"); set_scenario(page, "shop", 55, ("form", "catalog", "payment", "crm", "multilingual"), "urgent")
        screen = ui_total(page)
        path, _ = download_pdf(page, "pdf-long-names.pdf")
        t = pdf_text(path)
        n_pages = pdf_pages(path)
        check("PDF длинные названия: текст перенесён, слова на месте", "документацией для команды заказчика №5" in t.replace("\n", " ").replace("  ", " ") or "заказчика №5" in t)
        check("PDF длинные названия: итог = экран", screen[0] in t, str(screen))
        check("PDF нумерация страниц «Стр. 1 из N»", f"Стр. 1 из {n_pages}" in t, f"страниц: {n_pages}")
        check("Карточки с длинными названиями без горизонтальной прокрутки",
              page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        page.screenshot(path=str(OUT / "long-names-1440.png"), full_page=True)
        first_session_loads = len([u for u in requests if "jspdf.umd.min.js" in u])
        check("jsPDF загружен один раз за первую сессию (5 PDF)", first_session_loads == 1, f"загрузок: {first_session_loads}")
        requests.clear()
        page.reload(); page.wait_for_selector("#calculator-app[data-ready=true]")
        page.wait_for_timeout(2000)

        # 13. Быстрое многократное нажатие «Скачать PDF» → один файл
        downloads = []
        page.on("download", lambda d: downloads.append(d))
        page.evaluate("""() => { const b = document.getElementById('btn-pdf'); for (let i = 0; i < 5; i++) b.click(); }""")
        busy = page.get_attribute("#btn-pdf", "aria-busy")
        page.wait_for_function("document.getElementById('btn-pdf').getAttribute('aria-busy') === 'false'")
        page.wait_for_timeout(800)
        check("5 быстрых нажатий → 1 файл", len(downloads) == 1, f"файлов: {len(downloads)}")
        check("Кнопка в состоянии загрузки во время генерации", busy == "true")
        check("Кнопка восстановлена", plain(page.text_content("#btn-pdf .btn__label")) == "Скачать PDF для клиента")
        check("Ссылка-резерв «открыть файл» показана", page.is_visible("#pdf-status a"))
        page.click("label:has(input[value=form])")
        check("Ссылка на устаревший PDF скрывается после изменения параметров", page.is_hidden("#pdf-status"))

        # 14. Библиотеки не загружаются повторно
        vendor_loads = [u for u in requests if "jspdf.umd.min.js" in u]
        check("jsPDF загружен один раз после перезагрузки", len(vendor_loads) == 1, f"загрузок: {len(vendor_loads)}")
        external = [u for u in requests if not u.startswith(base) and not u.startswith("blob:") and not u.startswith("data:")]
        check("Нет запросов к сторонним серверам", not external, "; ".join(external))
        check("Нет ошибок JS на основной странице", not errors, "; ".join(errors))
        ctx.close()

        # 15. Ошибка: модуль PDF недоступен
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.route("**/assets/vendor/**", lambda r: r.abort())
        page.goto(base + "index.html"); page.wait_for_selector("#calculator-app[data-ready=true]")
        page.click("#btn-pdf")
        page.wait_for_function("document.getElementById('action-error').textContent.length > 0")
        check("Нет библиотеки → понятная ошибка", "Не удалось загрузить модуль формирования PDF" in page.text_content("#action-error"))
        check("Нет библиотеки → кнопка восстановлена", page.get_attribute("#btn-pdf", "aria-busy") == "false")
        page.check("input[name=projectType][value=corporate]")
        check("После ошибки калькулятор работает", ui_total(page)[0] == "80 000 ₽")
        page.unroute("**/assets/vendor/**")
        with page.expect_download(timeout=20000):
            page.click("#btn-pdf")
        check("После восстановления сети повторная попытка успешна", True)
        ctx.close()

        # 16. Ошибка внутри генератора
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.goto(base + "index.html"); page.wait_for_selector("#calculator-app[data-ready=true]")
        page.evaluate("WebsiteCalculator.loadPdfDeps()")
        page.evaluate("() => { window.jspdf.jsPDF.API.autoTable = function () { throw new Error('boom'); }; }")
        page.click("#btn-pdf")
        page.wait_for_function("document.getElementById('action-error').textContent.length > 0")
        check("Сбой генерации → сообщение «Не удалось сформировать PDF»", "Не удалось сформировать PDF" in page.text_content("#action-error"))
        check("Сбой генерации → кнопка восстановлена", page.get_attribute("#btn-pdf", "aria-disabled") == "false")
        ctx.close()

        # 17. Адаптивность
        for w in [320, 375, 768, 1024, 1440]:
            ctx = browser.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1, is_mobile=w < 768, has_touch=w < 1024)
            page = ctx.new_page()
            page.goto(base + "index.html"); page.wait_for_selector("#calculator-app[data-ready=true]")
            set_scenario(page, "corporate", 8, ("crm", "multilingual"), "fast")
            no_scroll = page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
            clipped = page.evaluate("""() => [...document.querySelectorAll('.totals__value, .breakdown td, .choice__title, .app-header__title, .btn')]
              .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className + ':' + e.textContent.trim().slice(0, 30))""")
            small_targets = page.evaluate("""() => [...document.querySelectorAll('button, .choice, .mobile-summary__link')]
              .filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.id || e.className)""")
            check(f"{w}px: нет горизонтальной прокрутки", no_scroll)
            check(f"{w}px: суммы и заголовки не обрезаны", not clipped, str(clipped))
            check(f"{w}px: цели нажатия ≥ 40px", not small_targets, str(small_targets))
            page.screenshot(path=str(OUT / f"viewport-{w}.png"), full_page=True)
            page.screenshot(path=str(OUT / f"viewport-{w}-fold.png"))
            if w >= 1024:
                pos = page.evaluate("getComputedStyle(document.getElementById('results')).position")
                card_h = page.evaluate("document.querySelector('.results__card').offsetHeight")
                check(f"{w}px: sticky включён, если карточка ({card_h}px) помещается в 900px", (pos == "sticky") == (card_h + 120 <= 900), pos)
                page.mouse.wheel(0, 600); page.wait_for_timeout(300)
                top = page.evaluate("document.querySelector('.results__card').getBoundingClientRect().top")
                bottom = page.evaluate("document.querySelector('.results__card').getBoundingClientRect().bottom")
                if pos == "sticky":
                    check(f"{w}px: результат в пределах экрана при прокрутке", top >= 0 and bottom <= 900, f"top={top}, bottom={bottom}")
            # Высокое окно: sticky должен включаться
            if w == 1440:
                ctx2 = browser.new_context(viewport={"width": 1440, "height": 1100})
                pg = ctx2.new_page(); pg.goto(base + "index.html"); pg.wait_for_selector("#calculator-app[data-ready=true]")
                pg.wait_for_timeout(200)
                pos = pg.evaluate("getComputedStyle(document.getElementById('results')).position")
                check("1440×1100: блок результатов sticky", pos == "sticky", pos)
                pg.mouse.wheel(0, 2000); pg.wait_for_timeout(300)
                r = pg.evaluate("(() => { const b = document.querySelector('.results__card').getBoundingClientRect(); return [b.top, b.bottom]; })()")
                check("1440×1100: при прокрутке до конца карточка в пределах экрана", r[0] >= 0 and r[1] <= 1100, str(r))
                ctx2.close()
            ctx.close()

        # 18. Клавиатура
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(base + "index.html"); page.wait_for_selector("#calculator-app[data-ready=true]")
        page.keyboard.press("Tab")
        check("Tab #1 → ссылка «Перейти к результату»", page.evaluate("document.activeElement.className") == "skip-link")
        page.keyboard.press("Tab")
        check("Tab #2 → радио типа сайта", page.evaluate("document.activeElement.name") == "projectType")
        page.keyboard.press("ArrowRight")
        check("Стрелка → корпоративный сайт выбран", page.is_checked("input[value=corporate]") and ui_total(page)[0] == "80 000 ₽")
        outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        check("Видимый фокус у радио", outline not in ("none", ""), outline)
        page.keyboard.press("Tab"); page.keyboard.press("Tab")
        check("Tab → поле страниц", page.evaluate("document.activeElement.id") == "pages-input")
        page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowUp")
        check("ArrowUp ×3 → 8 страниц, 92 000 ₽", page.input_value("#pages-input") == "8" and ui_total(page)[0] == "92 000 ₽")
        page.keyboard.press("Tab"); page.keyboard.press("Tab")
        check("Tab → первый чекбокс", page.evaluate("document.activeElement.value") == "form")
        page.keyboard.press("Space")
        check("Space включает чекбокс", page.is_checked("input[value=form]"))
        page.focus("#btn-reset"); page.keyboard.press("Enter")
        check("Enter на «Сбросить» работает", ui_total(page)[0] == "35 000 ₽")
        page.wait_for_timeout(800)
        check("aria-live сводка обновляется", "35 000 ₽" in plain(page.text_content("#sr-summary")))
        ctx.close()

        # 19. prefers-reduced-motion
        ctx = browser.new_context(reduced_motion="reduce")
        page = ctx.new_page()
        page.goto(base + "index.html"); page.wait_for_selector("#calculator-app[data-ready=true]")
        dur = page.evaluate("getComputedStyle(document.querySelector('.toast')).transitionDuration")
        check("prefers-reduced-motion отключает анимации", dur.startswith("1e-05s") or dur.startswith("0.00001s") or dur == "0s", dur)
        ctx.close()

        # 20. Браузерная страница тестов
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(base + "tests/run-in-browser.html")
        page.wait_for_selector("body[data-done]")
        check("tests/run-in-browser.html — все тесты пройдены", page.get_attribute("body", "data-done") == "pass", page.text_content("#summary"))
        ctx.close()

        browser.close()
    httpd.shutdown()

    passed = sum(r["ok"] for r in results)
    print(f"\nИТОГО: {passed}/{len(results)} проверок пройдено")
    (OUT / "e2e-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
