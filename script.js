/* ==========================================================================
   Калькулятор стоимости сайта
   --------------------------------------------------------------------------
   Структура файла:
     1. CONFIG            — прайс-лист, сроки, коэффициенты, название агентства
     2. Чистые функции    — нормализация ввода, calculate(), тексты, строки PDF
     3. PDF-генератор     — jsPDF + AutoTable, использует ТОЛЬКО объект calculate()
     4. Интерфейс         — состояние, отрисовка, события
   Пункты 1–3 не зависят от DOM и проверяются автотестами (tests/).
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------------
     1. CONFIG — меняйте цены и сроки здесь. Бизнес-логика читает только его.
     ------------------------------------------------------------------------ */
  var CONFIG = {
    agencyName: 'Digital Agency',          // демонстрационное название для PDF
    locale: 'ru-RU',

    pages: { min: 1, max: 100 },

    // Порядок ключей = порядок карточек в интерфейсе
    projectTypes: {
      landing: {
        name: 'Лендинг',
        nameLower: 'лендинг',
        nameGenitive: 'лендинга',
        description: 'Одностраничный сайт для продукта, услуги или рекламной кампании.',
        scope: 'Прототип и дизайн страницы, адаптивная вёрстка для компьютеров и смартфонов, базовая SEO-настройка (заголовки, мета-теги), подключение счётчика аналитики, публикация на хостинге заказчика.',
        price: 35000,
        duration: 7,                 // рабочих дней
        includedPages: 1,
        extraPagePrice: 5000,
        extraPageDuration: 1
      },
      corporate: {
        name: 'Корпоративный сайт',
        nameLower: 'корпоративный сайт',
        nameGenitive: 'корпоративного сайта',
        description: 'Сайт компании: услуги, о компании, контакты, новости.',
        scope: 'Структура сайта и прототипы, дизайн главной и шаблонов внутренних страниц, адаптивная вёрстка, система управления контентом, базовая SEO-настройка, подключение аналитики, публикация на хостинге заказчика.',
        price: 80000,
        duration: 15,
        includedPages: 5,
        extraPagePrice: 4000,
        extraPageDuration: 1
      },
      shop: {
        name: 'Интернет-магазин',
        nameLower: 'интернет-магазин',
        nameGenitive: 'интернет-магазина',
        description: 'Витрина с карточками товаров и корзиной.',
        scope: 'Структура магазина, дизайн витрины, карточки товара и корзины, оформление заказа, адаптивная вёрстка, управление товарами в админ-панели, базовая SEO-настройка, публикация на хостинге заказчика.',
        price: 150000,
        duration: 25,
        includedPages: 10,
        extraPagePrice: 3000,
        extraPageDuration: 0.5
      }
    },

    // Порядок элементов = порядок в интерфейсе, тексте и PDF
    features: [
      { id: 'form',         name: 'Форма заявки',          price: 5000,  duration: 1,
        scope: 'Форма с проверкой заполнения полей и уведомлением о новой заявке на email.' },
      { id: 'catalog',      name: 'Каталог товаров/услуг', price: 20000, duration: 3,
        scope: 'Разделы и фильтры каталога, карточки позиций, добавление и редактирование позиций в админ-панели.' },
      { id: 'payment',      name: 'Онлайн-оплата',         price: 25000, duration: 4,
        scope: 'Подключение платёжного сервиса заказчика, страницы успешной и неуспешной оплаты, проверка тестовых платежей.' },
      { id: 'crm',          name: 'Интеграция с CRM',      price: 15000, duration: 3,
        scope: 'Автоматическая передача заявок и заказов с сайта в CRM заказчика с сопоставлением полей.' },
      { id: 'multilingual', name: 'Мультиязычность',       price: 20000, duration: 4,
        scope: 'Переключатель языков и структура для переводов. Перевод текстов в стоимость не входит.' }
    ],

    urgency: {
      standard: {
        name: 'Стандартная',
        priceFactor: 1.0,
        durationFactor: 1.0,
        description: 'Без наценки',
        lineItem: null                       // наценки нет — строки в PDF нет
      },
      fast: {
        name: 'Ускоренная',
        priceFactor: 1.2,
        durationFactor: 0.8,
        description: '+20% к стоимости, срок меньше на 20%',
        lineItem: 'Ускоренное выполнение',
        scope: 'Приоритетное место в производственном графике и сокращённые сроки согласований.'
      },
      urgent: {
        name: 'Срочная',
        priceFactor: 1.4,
        durationFactor: 0.65,
        description: '+40% к стоимости, срок меньше на 35%',
        lineItem: 'Срочное выполнение',
        scope: 'Наивысший приоритет в производственном графике и сокращённые сроки согласований.'
      }
    },

    defaults: { projectType: 'landing', features: [], urgency: 'standard' },

    text: {
      disclaimer: 'Расчёт носит предварительный характер. Окончательная стоимость и сроки согласовываются после уточнения требований к проекту.',
      pdfNote: 'Данная оценка является предварительной и не является публичной офертой. Окончательная стоимость, сроки и состав работ определяются после уточнения требований и согласования технического задания.',
      pdfIntro: 'Благодарим за интерес к сотрудничеству. В документе приведены состав работ, стоимость и ориентировочные сроки разработки сайта по параметрам, обсуждённым на этапе первичного запроса.',
      pdfExtraPagesScope: 'Дизайн и вёрстка дополнительных страниц на основе утверждённых шаблонов.',
      pdfTiming: 'Срок указан в рабочих днях без учёта выходных и праздничных дней. Он является предварительным и отсчитывается от согласованной даты старта проекта.'
    },

    pdf: {
      vendorScripts: ['assets/vendor/jspdf.umd.min.js', 'assets/vendor/jspdf.plugin.autotable.min.js'],
      fontScript: 'assets/fonts/pdf-fonts.js',
      accent: [79, 70, 229],
      accentSoft: [238, 240, 255],
      text: [31, 36, 48],
      muted: [90, 98, 116],
      border: [227, 230, 238]
    }
  };

  /* ------------------------------------------------------------------------
     2. Чистые функции
     ------------------------------------------------------------------------ */

  var moneyFormatter = new Intl.NumberFormat(CONFIG.locale, { maximumFractionDigits: 0 });
  var numberFormatter = new Intl.NumberFormat(CONFIG.locale, { maximumFractionDigits: 2 });

  /** 125000 → «125 000 ₽» (неразрывные пробелы, чтобы сумма не переносилась) */
  function formatMoney(value) {
    return moneyFormatter.format(Math.round(value)) + ' ₽';
  }
  /** 25.5 → «25,5» */
  function formatNumber(value) {
    return numberFormatter.format(value);
  }

  /** Выбор формы слова: plural(5, ['день','дня','дней']) → 'дней' */
  function plural(n, forms) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  var DAY_FORMS = ['рабочий день', 'рабочих дня', 'рабочих дней'];
  var PAGE_FORMS = ['страница', 'страницы', 'страниц'];
  var PAGE_ACC_FORMS = ['страницу', 'страницы', 'страниц'];

  function formatDays(n) { return formatNumber(n) + ' ' + (Number.isInteger(n) ? plural(n, DAY_FORMS) : 'рабочего дня'); }
  function formatPages(n) { return n + ' ' + plural(n, PAGE_FORMS); }
  /** «до 1 страницы», «до 5 страниц» (родительный падеж) */
  function pagesGenitive(n) {
    return n + ' ' + ((n % 10 === 1 && n % 100 !== 11) ? 'страницы' : 'страниц');
  }
  /** «включена 1 страница», «включены 3 страницы», «включено 5 страниц» */
  function includedPhrase(n) {
    return plural(n, ['включена', 'включены', 'включено']) + ' ' + formatPages(n);
  }
  function lowerFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function upperFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /** Целочисленное деление с округлением вверх (без ошибок плавающей точки) */
  function ceilDiv(a, b) {
    var q = Math.floor(a / b);
    return q * b < a ? q + 1 : q;
  }
  /** Коэффициент → целые базисные пункты: 0.65 → 6500, 1.2 → 12000 */
  function toBasisPoints(factor) { return Math.round(factor * 10000); }

  /**
   * Нормализация количества страниц после завершения ввода.
   * @param {string|number} raw       введённое значение
   * @param {number} fallback         последнее корректное значение (для пустого/нечислового ввода)
   * @returns {{value:number, corrected:boolean, message:string}}
   */
  function normalizePages(raw, fallback) {
    var min = CONFIG.pages.min;
    var max = CONFIG.pages.max;
    var safeFallback = Number.isInteger(fallback) && fallback >= min && fallback <= max ? fallback : min;
    var str = String(raw == null ? '' : raw).trim().replace(/\s+/g, '').replace(',', '.');

    if (str === '') {
      return { value: safeFallback, corrected: true, message: 'Поле было пустым — восстановлено значение ' + safeFallback + '.' };
    }
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(str)) {
      return { value: safeFallback, corrected: true, message: 'Введите целое число от ' + min + ' до ' + max + '. Восстановлено значение ' + safeFallback + '.' };
    }
    var num = Number(str);
    var value = num;
    var reasons = [];
    if (!Number.isInteger(value)) {
      value = Math.round(value);
      reasons.push('количество страниц должно быть целым');
    }
    if (value < min) { value = min; reasons.push('минимум — ' + min); }
    if (value > max) { value = max; reasons.push('максимум — ' + max); }

    var corrected = value !== num;
    return {
      value: value,
      corrected: corrected,
      message: corrected ? 'Значение исправлено на ' + value + ': ' + reasons.join(', ') + '.' : ''
    };
  }

  /**
   * ЕДИНАЯ функция расчёта. Интерфейс, копирование и PDF используют только её результат.
   * @param {{projectType:string, pages:number, features:string[], urgency:string}} params
   */
  function calculate(params) {
    var type = CONFIG.projectTypes[params.projectType];
    if (!type) throw new Error('Неизвестный тип сайта: ' + params.projectType);
    var urgency = CONFIG.urgency[params.urgency];
    if (!urgency) throw new Error('Неизвестный режим срочности: ' + params.urgency);

    var pages = normalizePages(params.pages, type.includedPages).value;
    var extraPages = Math.max(0, pages - type.includedPages);

    // Функции: только известные, без дублей, в порядке прайс-листа
    var requested = new Set(Array.isArray(params.features) ? params.features : []);
    var features = CONFIG.features.filter(function (f) { return requested.has(f.id); });

    var basePrice = type.price;
    var pagesPrice = extraPages * type.extraPagePrice;
    var featuresPrice = features.reduce(function (sum, f) { return sum + f.price; }, 0);
    var subtotal = basePrice + pagesPrice + featuresPrice;

    var markupBp = toBasisPoints(urgency.priceFactor) - 10000;          // 1.2 → 2000
    var urgencyExtra = Math.round(subtotal * markupBp / 10000);
    var totalPrice = subtotal + urgencyExtra;

    // Сроки: считаем в сотых долях дня, чтобы избежать 20 × 0.65 = 13.000000000000002
    var typeDuration = type.duration;
    var pagesDuration = extraPages * type.extraPageDuration;
    var featuresDuration = features.reduce(function (sum, f) { return sum + f.duration; }, 0);
    var baseHundredths = Math.round(typeDuration * 100) + Math.round(pagesDuration * 100) +
      features.reduce(function (sum, f) { return sum + Math.round(f.duration * 100); }, 0);
    var baseDuration = baseHundredths / 100;
    var totalDuration = Math.max(1, ceilDiv(baseHundredths * toBasisPoints(urgency.durationFactor), 100 * 10000));

    return {
      projectType: params.projectType,
      projectTypeName: type.name,
      pages: pages,
      includedPages: type.includedPages,
      extraPages: extraPages,
      extraPagePrice: type.extraPagePrice,
      extraPageDuration: type.extraPageDuration,
      selectedFeatures: features.map(function (f) { return f.id; }),
      featureItems: features.map(function (f) { return { id: f.id, name: f.name, price: f.price, duration: f.duration }; }),
      urgency: params.urgency,
      urgencyName: urgency.name,
      urgencyDescription: urgency.description,
      markupPercent: markupBp / 100,
      durationFactor: urgency.durationFactor,
      basePrice: basePrice,
      pagesPrice: pagesPrice,
      featuresPrice: featuresPrice,
      subtotal: subtotal,
      urgencyExtra: urgencyExtra,
      totalPrice: totalPrice,
      typeDuration: typeDuration,
      pagesDuration: pagesDuration,
      featuresDuration: featuresDuration,
      baseDuration: baseDuration,
      totalDuration: totalDuration
    };
  }

  /** Динамическое пояснение под таблицей */
  function buildExplanation(r) {
    var type = CONFIG.projectTypes[r.projectType];
    var parts = [];
    parts.push('Выбран ' + type.nameLower + ' на ' + r.pages + ' ' + plural(r.pages, PAGE_ACC_FORMS) + '.');

    if (r.extraPages > 0) {
      parts.push('В базовую стоимость ' + includedPhrase(r.includedPages) + ', поэтому дополнительно ' +
        plural(r.extraPages, ['рассчитана', 'рассчитаны', 'рассчитано']) + ' ' + formatPages(r.extraPages) + '.');
    } else if (r.pages === r.includedPages) {
      parts.push('В базовую стоимость ' + includedPhrase(r.includedPages) + ', доплата за страницы не начисляется.');
    } else {
      parts.push('В базовую стоимость включено до ' + pagesGenitive(r.includedPages) +
        ', поэтому меньшее количество страниц не снижает стоимость и срок.');
    }

    if (r.featureItems.length === 0) {
      parts.push('Дополнительные функции не выбраны.');
    } else {
      parts.push('Дополнительные функции: ' + r.featureItems.map(function (f) { return lowerFirst(f.name); }).join(', ') + '.');
    }

    if (r.urgency === 'standard') {
      parts.push('Проект выполняется в стандартные сроки.');
    } else {
      parts.push('Выбран режим «' + r.urgencyName + '»: ' + lowerFirst(r.urgencyDescription) + '.');
    }
    return parts.join(' ');
  }

  /** «7 + 3 (страницы) + 3 (функции) = 13 дн. × 0,8 → 11 рабочих дней» */
  function buildDurationFormula(r) {
    var parts = [formatNumber(r.typeDuration) + ' (база)'];
    if (r.pagesDuration > 0) parts.push(formatNumber(r.pagesDuration) + ' (страницы)');
    if (r.featuresDuration > 0) parts.push(formatNumber(r.featuresDuration) + ' (функции)');
    var s = parts.join(' + ');
    if (parts.length > 1) s += ' = ' + formatNumber(r.baseDuration);
    if (r.durationFactor !== 1) {
      return s + ' × ' + formatNumber(r.durationFactor) + ', округление вверх → ' + formatDays(r.totalDuration);
    }
    if (!Number.isInteger(r.baseDuration)) return s + ', округление вверх → ' + formatDays(r.totalDuration);
    if (parts.length === 1) return formatDays(r.totalDuration) + ' — срок базового тарифа';
    return s + ' ' + plural(r.totalDuration, DAY_FORMS);
  }

  /** Текст для буфера обмена (Telegram, email, CRM) */
  function buildCopyText(r) {
    var lines = [];
    lines.push('ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА РАЗРАБОТКИ САЙТА');
    lines.push('');
    lines.push('Тип сайта: ' + r.projectTypeName);
    lines.push('Количество страниц: ' + r.pages + ' (включено в базовую стоимость: ' + r.includedPages +
      ', дополнительно: ' + r.extraPages + ')');
    lines.push('Дополнительные функции: ' + (r.featureItems.length
      ? r.featureItems.map(function (f) { return f.name; }).join(', ')
      : 'не выбраны'));
    lines.push('Срочность: ' + r.urgencyName + ' (' + lowerFirst(r.urgencyDescription) + ')');
    lines.push('');
    lines.push('Детализация стоимости:');
    lines.push('• Базовый тип сайта (' + r.projectTypeName + ', ' + includedPhrase(r.includedPages) + '): ' + formatMoney(r.basePrice));
    lines.push('• Дополнительные страницы' + (r.extraPages > 0
      ? ' (' + r.extraPages + ' × ' + formatMoney(r.extraPagePrice) + ')'
      : '') + ': ' + formatMoney(r.pagesPrice));
    lines.push('• Дополнительные функции: ' + formatMoney(r.featuresPrice));
    if (r.featureItems.length) {
      r.featureItems.forEach(function (f) { lines.push('   – ' + f.name + ': ' + formatMoney(f.price)); });
    } else {
      lines.push('   – Дополнительные функции не выбраны');
    }
    lines.push('• Наценка за срочность' + (r.markupPercent ? ' (+' + formatNumber(r.markupPercent) + '%)' : '') + ': ' + formatMoney(r.urgencyExtra));
    lines.push('');
    lines.push('Итоговая стоимость: ' + formatMoney(r.totalPrice));
    lines.push('Ориентировочный срок: ' + formatDays(r.totalDuration));
    lines.push('');
    lines.push(CONFIG.text.disclaimer);
    return lines.join('\n');
  }

  /**
   * Строки таблицы «Состав работ и стоимость» для PDF.
   * Ничего не пересчитывает — только раскладывает готовый результат calculate().
   */
  function buildPdfRows(r) {
    var type = CONFIG.projectTypes[r.projectType];
    var rows = [];
    rows.push({ name: 'Разработка ' + type.nameGenitive + ' (' + includedPhrase(r.includedPages) + ')', qty: 1, amount: r.basePrice });
    if (r.extraPages > 0) {
      rows.push({ name: 'Дополнительные страницы (' + formatMoney(r.extraPagePrice) + ' за страницу)', qty: r.extraPages, amount: r.pagesPrice });
    }
    r.featureItems.forEach(function (f) { rows.push({ name: f.name, qty: 1, amount: f.price }); });
    if (r.urgencyExtra > 0) {
      var urgency = CONFIG.urgency[r.urgency];
      rows.push({ name: urgency.lineItem + ' (+' + formatNumber(r.markupPercent) + '%)', qty: 1, amount: r.urgencyExtra });
    }
    return rows;
  }

  /** Раздел «Что входит в работы»: описания берутся из CONFIG, только для выбранных позиций */
  function buildScopeRows(r) {
    var type = CONFIG.projectTypes[r.projectType];
    var urgency = CONFIG.urgency[r.urgency];
    var rows = [];
    if (type.scope) rows.push({ title: 'Разработка ' + type.nameGenitive, text: type.scope });
    if (r.extraPages > 0 && CONFIG.text.pdfExtraPagesScope) {
      rows.push({ title: 'Дополнительные страницы (' + r.extraPages + ')', text: CONFIG.text.pdfExtraPagesScope });
    }
    r.featureItems.forEach(function (item) {
      var f = CONFIG.features.filter(function (x) { return x.id === item.id; })[0];
      if (f && f.scope) rows.push({ title: f.name, text: f.scope });
    });
    if (r.urgencyExtra > 0 && urgency.scope) rows.push({ title: urgency.lineItem, text: urgency.scope });
    return rows;
  }

  /** Проверка согласованности данных перед формированием документа */
  function verifyResult(r) {
    var rows = buildPdfRows(r);
    var rowsSum = rows.reduce(function (s, row) { return s + row.amount; }, 0);
    var errors = [];
    if (rowsSum !== r.totalPrice) errors.push('сумма строк ' + rowsSum + ' ≠ итог ' + r.totalPrice);
    if (r.subtotal + r.urgencyExtra !== r.totalPrice) errors.push('итог не равен базовой сумме + наценке');
    if (r.basePrice + r.pagesPrice + r.featuresPrice !== r.subtotal) errors.push('базовая сумма не сходится');
    if (!Number.isInteger(r.totalPrice) || r.totalPrice <= 0) errors.push('некорректная итоговая стоимость');
    if (!Number.isInteger(r.totalDuration) || r.totalDuration < 1) errors.push('некорректный срок');
    if (r.selectedFeatures.length !== r.featureItems.length) errors.push('список функций не совпадает');
    if (errors.length) throw new Error('Проверка расчёта не пройдена: ' + errors.join('; '));
    return rows;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** EST-YYYYMMDD-HHMMSS (локальное время) */
  function buildEstimateNumber(d) {
    return 'EST-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
      pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  /** Website_Estimate_YYYY-MM-DD.pdf */
  function buildFileName(d) {
    return 'Website_Estimate_' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.pdf';
  }
  function formatDate(d) {
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  /* ------------------------------------------------------------------------
     3. PDF-генератор
     ------------------------------------------------------------------------ */

  var pdfDepsPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;                         // сохранить порядок: jsPDF → AutoTable
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Не удалось загрузить файл ' + src)); };
      document.head.appendChild(s);
    });
  }

  /** Библиотеки и шрифт загружаются один раз; при ошибке можно повторить */
  function loadPdfDeps() {
    if (pdfDepsPromise) return pdfDepsPromise;
    var scripts = CONFIG.pdf.vendorScripts.concat(CONFIG.pdf.fontScript);
    pdfDepsPromise = Promise.all(scripts.map(loadScript)).then(function () {
      var JsPDF = global.jspdf && global.jspdf.jsPDF;
      if (!JsPDF) throw new Error('Библиотека jsPDF не инициализировалась');
      if (typeof JsPDF.API.autoTable !== 'function') {
        if (typeof global.applyPlugin === 'function') global.applyPlugin(JsPDF);
        if (typeof JsPDF.API.autoTable !== 'function') throw new Error('Плагин AutoTable не инициализировался');
      }
      if (!global.PDF_FONTS || !global.PDF_FONTS.regular) throw new Error('Шрифт для PDF не загрузился');
      return JsPDF;
    }).catch(function (err) {
      pdfDepsPromise = null;
      err.isLoadError = true;
      throw err;
    });
    return pdfDepsPromise;
  }

  /**
   * Собирает PDF-документ. Принимает ГОТОВЫЙ результат calculate().
   * @returns {jsPDF}
   */
  function buildPdfDocument(JsPDF, r, createdAt) {
    var C = CONFIG.pdf;
    var rows = verifyResult(r);
    var doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

    doc.addFileToVFS('Inter-Regular.ttf', global.PDF_FONTS.regular);
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
    doc.addFileToVFS('Inter-Bold.ttf', global.PDF_FONTS.bold);
    doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
    doc.setFont('Inter', 'normal');

    var estimateNumber = buildEstimateNumber(createdAt);
    doc.setProperties({
      title: 'Предварительная оценка разработки сайта ' + estimateNumber,
      subject: 'Предварительная смета',
      author: CONFIG.agencyName,
      creator: CONFIG.agencyName
    });

    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var M = 18;                         // поля
    var contentW = pageW - M * 2;
    var bottomLimit = pageH - 18;       // место под колонтитул
    var y = 0;

    function setText(size, style, color) {
      doc.setFont('Inter', style || 'normal');
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, color || C.text);
    }
    function lineH(size) { return size * 0.3528 * 1.4; }       // pt → mm × межстрочный
    function ensureSpace(h) {
      if (y + h > bottomLimit) { doc.addPage(); y = M; }
    }
    function paragraph(text, size, style, color, width) {
      setText(size, style, color);
      var lines = doc.splitTextToSize(text, width || contentW);
      var lh = lineH(size);
      lines.forEach(function (ln) {
        ensureSpace(lh);
        doc.text(ln, M, y + lh * 0.75);
        y += lh;
      });
    }
    /** keepWith — высота, которую нужно удержать на одной странице с заголовком */
    function sectionTitle(text, keepWith) {
      ensureSpace(14 + (keepWith || 12)); // заголовок не остаётся один внизу страницы
      y += 4;
      doc.setFillColor.apply(doc, C.accent);
      doc.rect(M, y + 0.6, 1.2, 5, 'F');
      setText(12.5, 'bold', C.text);
      doc.text(text, M + 4, y + 4.8);
      y += 10;
    }

    /* --- Шапка --- */
    doc.setFillColor.apply(doc, C.accent);
    doc.rect(0, 0, pageW, 4, 'F');
    y = 14;
    setText(11, 'bold', C.accent);
    var agencyLines = doc.splitTextToSize(CONFIG.agencyName, contentW * 0.5);
    doc.text(agencyLines, M, y + 4);
    setText(9, 'normal', C.muted);
    doc.text('№ ' + estimateNumber, pageW - M, y + 2.5, { align: 'right' });
    doc.text('Дата формирования: ' + formatDate(createdAt), pageW - M, y + 7.5, { align: 'right' });
    y += Math.max(10, agencyLines.length * lineH(11)) + 6;

    setText(18, 'bold', C.text);
    var titleLines = doc.splitTextToSize('ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА РАЗРАБОТКИ САЙТА', contentW);
    titleLines.forEach(function (ln) { doc.text(ln, M, y + 6); y += lineH(18); });
    y += 4;
    doc.setDrawColor.apply(doc, C.border);
    doc.setLineWidth(0.3);
    doc.line(M, y, pageW - M, y);
    y += 5;
    paragraph(CONFIG.text.pdfIntro, 10, 'normal', C.muted);
    y += 4;

    /* --- Итоговая плашка --- */
    var boxH = 24;
    doc.setFillColor.apply(doc, C.accentSoft);
    doc.roundedRect(M, y, contentW, boxH, 2.5, 2.5, 'F');
    var colW = contentW / 2;
    setText(9, 'normal', C.muted);
    doc.text('Предварительная стоимость', M + 6, y + 8);
    doc.text('Ориентировочный срок', M + colW + 6, y + 8);
    setText(17, 'bold', C.accent);
    doc.text(formatMoney(r.totalPrice), M + 6, y + 17);
    setText(14, 'bold', C.text);
    doc.text(formatDays(r.totalDuration), M + colW + 6, y + 17);
    doc.setDrawColor(205, 208, 245);
    doc.line(M + colW, y + 5, M + colW, y + boxH - 5);
    y += boxH + 4;

    var tableBase = {
      margin: { left: M, right: M, top: M, bottom: 20 },
      styles: { font: 'Inter', fontSize: 10, textColor: C.text, cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 }, overflow: 'linebreak', lineColor: C.border },
      rowPageBreak: 'avoid'
    };

    /* --- Информация о проекте --- */
    sectionTitle('Информация о проекте');
    var featuresText = r.featureItems.length
      ? r.featureItems.map(function (f) { return '• ' + f.name; }).join('\n')
      : 'Дополнительные функции не выбраны';
    var pagesText = r.pages + ' (в базовую стоимость ' + includedPhrase(r.includedPages) +
      (r.extraPages > 0 ? ', дополнительно — ' + r.extraPages + ')' : ')');
    doc.autoTable(Object.assign({}, tableBase, {
      startY: y,
      theme: 'plain',
      body: [
        ['Тип сайта', r.projectTypeName],
        ['Количество страниц', pagesText],
        ['Срочность', r.urgencyName + ' — ' + lowerFirst(r.urgencyDescription)],
        ['Дополнительные функции', featuresText]
      ],
      columnStyles: {
        0: { cellWidth: 52, textColor: C.muted },
        1: { cellWidth: 'auto' }
      },
      didParseCell: function (data) { data.cell.styles.lineWidth = { bottom: 0.2 }; }
    }));
    y = doc.lastAutoTable.finalY + 4;

    /* --- Состав работ и стоимость --- */
    sectionTitle('Состав работ и стоимость');
    doc.autoTable(Object.assign({}, tableBase, {
      startY: y,
      theme: 'grid',
      head: [['Наименование', 'Количество', 'Стоимость']],
      body: rows.map(function (row) { return [row.name, String(row.qty), formatMoney(row.amount)]; }),
      foot: [['Итого', '', formatMoney(r.totalPrice)]],
      showHead: 'everyPage',
      showFoot: 'lastPage',
      headStyles: { fillColor: C.accent, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
      footStyles: { fillColor: C.accentSoft, textColor: C.accent, fontStyle: 'bold', fontSize: 12, lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 40, halign: 'right' }
      },
      didParseCell: function (data) {
        if (data.section !== 'body' && data.column.index === 1) data.cell.styles.halign = 'center';
        if (data.section !== 'body' && data.column.index === 2) data.cell.styles.halign = 'right';
        if (data.section === 'body') data.cell.styles.lineWidth = 0.2;
      }
    }));
    y = doc.lastAutoTable.finalY + 4;

    /* --- Что входит в работы --- */
    var scopeRows = buildScopeRows(r);
    if (scopeRows.length) {
      sectionTitle('Что входит в работы', 16);
      doc.autoTable(Object.assign({}, tableBase, {
        startY: y,
        theme: 'plain',
        body: scopeRows.map(function (x) { return [x.title, x.text]; }),
        columnStyles: {
          0: { cellWidth: 52, fontStyle: 'bold' },
          1: { cellWidth: 'auto', textColor: C.muted, fontSize: 9.5 }
        },
        didParseCell: function (data) { data.cell.styles.lineWidth = { bottom: 0.2 }; }
      }));
      y = doc.lastAutoTable.finalY + 4;
    }

    /* --- Сроки реализации --- */
    sectionTitle('Сроки реализации');
    doc.autoTable(Object.assign({}, tableBase, {
      startY: y,
      theme: 'plain',
      body: [
        ['Ориентировочный срок', formatDays(r.totalDuration)],
        ['Режим срочности', r.urgencyName + ' — ' + lowerFirst(r.urgencyDescription)]
      ],
      columnStyles: { 0: { cellWidth: 52, textColor: C.muted }, 1: { cellWidth: 'auto' } },
      didParseCell: function (data) {
        data.cell.styles.lineWidth = { bottom: 0.2 };
        if (data.row.index === 0 && data.column.index === 1) data.cell.styles.fontStyle = 'bold';
      }
    }));
    y = doc.lastAutoTable.finalY + 3;
    paragraph(CONFIG.text.pdfTiming, 9.5, 'normal', C.muted);

    /* --- Примечания --- */
    y += 2;
    setText(9.5, 'normal');
    sectionTitle('Примечания', doc.splitTextToSize(CONFIG.text.pdfNote, contentW).length * lineH(9.5));
    paragraph(CONFIG.text.pdfNote, 9.5, 'normal', C.text);

    /* --- Колонтитулы и нумерация --- */
    var total = doc.getNumberOfPages();
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, C.border);
      doc.setLineWidth(0.3);
      doc.line(M, pageH - 14, pageW - M, pageH - 14);
      setText(8, 'normal', C.muted);
      var footerLeft = doc.splitTextToSize(CONFIG.agencyName + ' · ' + estimateNumber, contentW - 30);
      doc.text(footerLeft.length > 1 ? doc.splitTextToSize(CONFIG.agencyName, contentW - 62)[0] + '… · ' + estimateNumber : footerLeft[0], M, pageH - 9);
      doc.text('Стр. ' + i + ' из ' + total, pageW - M, pageH - 9, { align: 'right' });
    }
    return doc;
  }

  /* ------------------------------------------------------------------------
     Публичный API (используется тестами)
     ------------------------------------------------------------------------ */
  var api = {
    CONFIG: CONFIG,
    calculate: calculate,
    normalizePages: normalizePages,
    formatMoney: formatMoney,
    formatDays: formatDays,
    buildExplanation: buildExplanation,
    buildDurationFormula: buildDurationFormula,
    buildCopyText: buildCopyText,
    buildPdfRows: buildPdfRows,
    buildScopeRows: buildScopeRows,
    verifyResult: verifyResult,
    buildEstimateNumber: buildEstimateNumber,
    buildFileName: buildFileName,
    loadPdfDeps: loadPdfDeps,
    buildPdfDocument: buildPdfDocument
  };
  global.WebsiteCalculator = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  /* ------------------------------------------------------------------------
     4. Интерфейс
     ------------------------------------------------------------------------ */
  if (typeof document === 'undefined') return;

  function initApp() {
    var root = document.getElementById('calculator-app');
    if (!root) return;

    var $ = function (id) { return document.getElementById(id); };
    var els = {
      form: $('calc-form'),
      typeOptions: $('type-options'),
      featureOptions: $('feature-options'),
      urgencyOptions: $('urgency-options'),
      pagesInput: $('pages-input'),
      pagesDec: $('pages-dec'),
      pagesInc: $('pages-inc'),
      pagesHint: $('pages-hint'),
      pagesMessage: $('pages-message'),
      totalPrice: $('total-price'),
      totalDuration: $('total-duration'),
      srSummary: $('sr-summary'),
      bdBase: $('bd-base'), bdBaseNote: $('bd-base-note'),
      bdPages: $('bd-pages'), bdPagesNote: $('bd-pages-note'),
      bdFeatures: $('bd-features'), bdFeaturesNote: $('bd-features-note'), bdFeaturesList: $('bd-features-list'),
      bdUrgency: $('bd-urgency'), bdUrgencyNote: $('bd-urgency-note'),
      bdTotal: $('bd-total'),
      durationFormula: $('duration-formula'),
      explanation: $('explanation'),
      btnPdf: $('btn-pdf'),
      btnCopy: $('btn-copy'),
      btnReset: $('btn-reset'),
      pdfStatus: $('pdf-status'),
      actionError: $('action-error'),
      copyFallback: $('copy-fallback'),
      copyFallbackText: $('copy-fallback-text'),
      copyFallbackClose: $('copy-fallback-close'),
      toast: $('toast'),
      mobileSummary: $('mobile-summary'),
      mobilePrice: $('mobile-price'),
      mobileDays: $('mobile-days'),
      results: $('results')
    };

    /* ---------- Построение элементов из CONFIG (без innerHTML) ---------- */
    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function buildChoice(opts) {
      var label = el('label', opts.layout === 'card' ? 'choice choice--card' : 'choice');
      var input = el('input', 'choice__control');
      input.type = opts.type;
      input.name = opts.name;
      input.value = opts.value;
      input.id = opts.name + '-' + opts.value;
      var body = el('span', 'choice__body');
      var title = el('span', 'choice__title', opts.title);

      if (opts.layout === 'card') {
        var head = el('span', 'choice__head');
        head.append(input, title);
        label.append(head);
      } else {
        label.append(input);
        body.append(title);
      }
      if (opts.desc) body.append(el('span', 'choice__desc', opts.desc));
      var meta = el('span', 'choice__meta');
      opts.meta.forEach(function (m) { meta.append(el('span', m.cls, m.text)); });
      body.append(meta);
      label.append(body);
      return label;
    }

    Object.keys(CONFIG.projectTypes).forEach(function (key) {
      var t = CONFIG.projectTypes[key];
      els.typeOptions.append(buildChoice({
        type: 'radio', name: 'projectType', value: key, layout: 'card',
        title: t.name, desc: t.description,
        meta: [
          { cls: 'choice__price', text: 'от ' + formatMoney(t.price) },
          { cls: 'choice__days', text: 'от ' + formatDays(t.duration) },
          { cls: 'choice__days', text: 'включено: ' + formatPages(t.includedPages) }
        ]
      }));
    });

    CONFIG.features.forEach(function (f) {
      els.featureOptions.append(buildChoice({
        type: 'checkbox', name: 'features', value: f.id,
        title: f.name,
        meta: [
          { cls: 'choice__price', text: '+' + formatMoney(f.price) },
          { cls: 'choice__days', text: '+' + formatNumber(f.duration) + ' ' + plural(f.duration, ['день', 'дня', 'дней']) }
        ]
      }));
    });

    Object.keys(CONFIG.urgency).forEach(function (key) {
      var u = CONFIG.urgency[key];
      els.urgencyOptions.append(buildChoice({
        type: 'radio', name: 'urgency', value: key, layout: 'card',
        title: u.name,
        meta: [{ cls: 'choice__desc', text: u.description }]
      }));
    });

    /* ---------- Состояние ---------- */
    function defaultState() {
      var d = CONFIG.defaults;
      return {
        projectType: d.projectType,
        pages: CONFIG.projectTypes[d.projectType].includedPages,
        features: d.features.slice(),
        urgency: d.urgency
      };
    }
    var state = defaultState();
    var lastResult = null;

    function setState(patch) {
      state = Object.assign({}, state, patch);
      render();
    }

    /* ---------- Отрисовка (меняем только изменившийся текст) ---------- */
    function setText(node, value) { if (node.textContent !== value) node.textContent = value; }

    function syncForm() {
      els.form.querySelectorAll('input[name="projectType"]').forEach(function (i) { i.checked = i.value === state.projectType; });
      els.form.querySelectorAll('input[name="urgency"]').forEach(function (i) { i.checked = i.value === state.urgency; });
      els.form.querySelectorAll('input[name="features"]').forEach(function (i) { i.checked = state.features.indexOf(i.value) !== -1; });
      // Пока пользователь печатает в поле, не перезаписываем промежуточное значение
      if (document.activeElement !== els.pagesInput && els.pagesInput.value !== String(state.pages)) {
        els.pagesInput.value = String(state.pages);
      }
      els.pagesDec.setAttribute('aria-disabled', String(state.pages <= CONFIG.pages.min));
      els.pagesInc.setAttribute('aria-disabled', String(state.pages >= CONFIG.pages.max));
    }

    var featuresSignature = null;
    var srTimer = null;

    function render() {
      var r = calculate(state);
      lastResult = r;
      syncForm();

      setText(els.totalPrice, formatMoney(r.totalPrice));
      setText(els.totalDuration, formatDays(r.totalDuration));
      setText(els.mobilePrice, formatMoney(r.totalPrice));
      setText(els.mobileDays, formatDays(r.totalDuration));

      var type = CONFIG.projectTypes[r.projectType];
      setText(els.pagesHint, 'Допустимо от ' + CONFIG.pages.min + ' до ' + CONFIG.pages.max + '. В тариф «' + type.name +
        '» ' + includedPhrase(r.includedPages) + ', каждая следующая — ' + formatMoney(r.extraPagePrice) +
        ' и +' + formatNumber(r.extraPageDuration) + ' ' + (Number.isInteger(r.extraPageDuration) ? plural(r.extraPageDuration, ['день', 'дня', 'дней']) : 'дня') + '.');

      setText(els.bdBase, formatMoney(r.basePrice));
      setText(els.bdBaseNote, r.projectTypeName + ', ' + includedPhrase(r.includedPages));
      setText(els.bdPages, formatMoney(r.pagesPrice));
      setText(els.bdPagesNote, r.extraPages > 0
        ? r.extraPages + ' × ' + formatMoney(r.extraPagePrice)
        : (r.pages < r.includedPages ? 'В базовую стоимость включено до ' + pagesGenitive(r.includedPages) : 'Не требуются'));
      setText(els.bdFeatures, formatMoney(r.featuresPrice));
      setText(els.bdFeaturesNote, r.featureItems.length ? '' : 'Дополнительные функции не выбраны');

      var sig = r.selectedFeatures.join('|');
      if (sig !== featuresSignature) {
        featuresSignature = sig;
        var items = r.featureItems.map(function (f) {
          var li = el('li');
          li.append(el('span', null, f.name), el('span', null, formatMoney(f.price)));
          return li;
        });
        els.bdFeaturesList.replaceChildren.apply(els.bdFeaturesList, items);
      }

      setText(els.bdUrgency, formatMoney(r.urgencyExtra));
      setText(els.bdUrgencyNote, r.urgencyExtra > 0 ? r.urgencyName + ', +' + formatNumber(r.markupPercent) + '%' : 'Стандартная срочность, без наценки');
      setText(els.bdTotal, formatMoney(r.totalPrice));
      setText(els.durationFormula, buildDurationFormula(r));
      setText(els.explanation, buildExplanation(r));

      // Озвучивание итога с задержкой, чтобы не зачитывать каждое нажатие
      clearTimeout(srTimer);
      srTimer = setTimeout(function () {
        setText(els.srSummary, 'Итого ' + formatMoney(r.totalPrice) + ', срок ' + formatDays(r.totalDuration) + '.');
      }, 600);

      // Ссылка на старый PDF больше не соответствует расчёту
      if (pdfUrl && pdfResultKey !== resultKey(r)) hidePdfStatus();
      scheduleStickyCheck();
    }

    /* Sticky-режим результата: только на широких экранах и если карточка помещается по высоте */
    var desktopMq = global.matchMedia ? global.matchMedia('(min-width: 1024px)') : null;
    var stickyFrame = 0;
    function scheduleStickyCheck() {
      if (stickyFrame) return;
      stickyFrame = (global.requestAnimationFrame || setTimeout)(function () {
        stickyFrame = 0;
        var card = els.results.firstElementChild;
        var fits = !!desktopMq && desktopMq.matches && card.offsetHeight + 120 <= global.innerHeight;
        els.results.classList.toggle('is-sticky', fits);
        document.body.classList.toggle('results-unpinned', !!desktopMq && desktopMq.matches && !fits);
      });
    }
    global.addEventListener('resize', scheduleStickyCheck);

    function resultKey(r) { return [r.projectType, r.pages, r.selectedFeatures.join(','), r.urgency, r.totalPrice, r.totalDuration].join('/'); }

    /* ---------- Страницы ---------- */
    function showPagesMessage(text) { setText(els.pagesMessage, text || ''); }

    function commitPagesInput() {
      var res = normalizePages(els.pagesInput.value, state.pages);
      els.pagesInput.value = String(res.value);
      // Сообщение показываем при исправлении; корректный ввод очищает его в обработчике input
      if (res.corrected) showPagesMessage(res.message);
      if (res.value !== state.pages) setState({ pages: res.value });
      else syncForm();
    }

    function stepPages(delta) {
      var current = normalizePages(els.pagesInput.value, state.pages).value;
      var next = Math.min(CONFIG.pages.max, Math.max(CONFIG.pages.min, current + delta));
      els.pagesInput.value = String(next);
      showPagesMessage('');
      setState({ pages: next });
    }

    els.pagesDec.addEventListener('click', function () { stepPages(-1); });
    els.pagesInc.addEventListener('click', function () { stepPages(1); });

    // Во время набора не мешаем: пересчитываем, только если введено корректное целое
    els.pagesInput.addEventListener('input', function () {
      var raw = els.pagesInput.value.trim();
      if (/^\d{1,3}$/.test(raw)) {
        var n = Number(raw);
        if (n >= CONFIG.pages.min && n <= CONFIG.pages.max) {
          showPagesMessage('');
          if (n !== state.pages) setState({ pages: n });
        }
      }
    });
    els.pagesInput.addEventListener('blur', commitPagesInput);
    els.pagesInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commitPagesInput(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); stepPages(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); stepPages(-1); }
    });

    /* ---------- Радио и чекбоксы ---------- */
    els.form.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'projectType') {
        showPagesMessage('');
        setState({ projectType: t.value, pages: CONFIG.projectTypes[t.value].includedPages });
      } else if (t.name === 'urgency') {
        setState({ urgency: t.value });
      } else if (t.name === 'features') {
        var checked = Array.prototype.filter.call(
          els.form.querySelectorAll('input[name="features"]'), function (i) { return i.checked; }
        ).map(function (i) { return i.value; });
        setState({ features: checked });           // состояние строится заново, без накопления
      }
    });
    els.form.addEventListener('submit', function (e) { e.preventDefault(); });

    /* ---------- Уведомления ---------- */
    var toastTimer = null;
    function toast(message, isError) {
      clearTimeout(toastTimer);
      els.toast.classList.toggle('is-error', !!isError);
      els.toast.textContent = message;
      els.toast.classList.add('is-visible');
      toastTimer = setTimeout(function () { els.toast.classList.remove('is-visible'); }, isError ? 6000 : 3000);
    }
    function showError(message) { setText(els.actionError, message); }
    function clearError() { setText(els.actionError, ''); }

    /* ---------- Сброс ---------- */
    els.btnReset.addEventListener('click', function () {
      showPagesMessage('');
      clearError();
      hideCopyFallback();
      state = defaultState();
      render();
      toast('Параметры сброшены');
    });

    /* ---------- Копирование ---------- */
    function legacyCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    function hideCopyFallback() { els.copyFallback.hidden = true; }
    function showCopyFallback(text) {
      els.copyFallbackText.value = text;
      els.copyFallback.hidden = false;
      els.copyFallbackText.focus();
      els.copyFallbackText.select();
    }
    els.copyFallbackClose.addEventListener('click', function () { hideCopyFallback(); els.btnCopy.focus(); });

    els.btnCopy.addEventListener('click', function () {
      clearError();
      var text = buildCopyText(calculate(state));
      var done = function () { hideCopyFallback(); toast('Расчёт скопирован'); };
      var fail = function () {
        if (legacyCopy(text)) { done(); return; }
        showCopyFallback(text);
        toast('Не удалось скопировать автоматически', true);
      };
      if (navigator.clipboard && global.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(done, fail);
      } else {
        fail();
      }
    });

    /* ---------- PDF ---------- */
    var isExporting = false;
    // При открытии внутри Claude скачивание идёт через платформенный downloads; на обычном сайте его нет
    var hostDownloads = (global.claude && typeof global.claude.use === 'function')
      ? Promise.resolve(global.claude.use('downloads')).catch(function () { return null; })
      : Promise.resolve(null);
    var pdfUrl = null;
    var pdfResultKey = null;
    var btnLabel = els.btnPdf.querySelector('.btn__label');
    var btnLabelDefault = btnLabel.textContent;

    function hidePdfStatus() {
      els.pdfStatus.hidden = true;
      els.pdfStatus.replaceChildren();
      if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; }
    }
    function showPdfStatus(fileName, url) {
      var a = el('a', null, 'открыть файл');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener';
      els.pdfStatus.replaceChildren(
        document.createTextNode('PDF сформирован: ' + fileName + '. Если загрузка не началась, '), a, document.createTextNode('.')
      );
      els.pdfStatus.hidden = false;
    }

    function setExporting(on) {
      isExporting = on;
      els.btnPdf.setAttribute('aria-busy', String(on));
      els.btnPdf.setAttribute('aria-disabled', String(on));
      btnLabel.textContent = on ? 'Формируем PDF…' : btnLabelDefault;
    }

    els.btnPdf.addEventListener('click', function () {
      if (isExporting) return;                       // защита от повторного запуска
      clearError();
      setExporting(true);
      var snapshot = calculate(state);               // актуальный единый результат
      var createdAt = new Date();

      loadPdfDeps()
        .then(function (JsPDF) {
          // даём браузеру отрисовать состояние кнопки
          return new Promise(function (res) { setTimeout(res, 30); }).then(function () { return JsPDF; });
        })
        .then(function (JsPDF) {
          var doc = buildPdfDocument(JsPDF, snapshot, createdAt);
          var fileName = buildFileName(createdAt);
          var blob = doc.output('blob');
          hidePdfStatus();
          return hostDownloads.then(function (downloads) {
            if (downloads) {
              // Просмотр внутри Claude: файл отдаётся через подтверждение платформы
              return downloads.save({ filename: fileName, data: blob }).then(function () {
                toast('PDF сохранён');
              }, function (e) {
                if (e && e.code === 'declined') { toast('Сохранение отменено'); return; }
                if (e && e.code === 'rate_limited') { toast('Подтвердите или закройте предыдущий запрос на сохранение'); return; }
                throw e;
              });
            }
            pdfUrl = URL.createObjectURL(blob);
            pdfResultKey = resultKey(snapshot);
            var a = document.createElement('a');
            a.href = pdfUrl;
            a.download = fileName;
            a.rel = 'noopener';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showPdfStatus(fileName, pdfUrl);
            toast('PDF сформирован');
          });
        })
        .catch(function (err) {
          if (global.console) console.error(err);
          var msg = err && err.isLoadError
            ? 'Не удалось загрузить модуль формирования PDF. Проверьте подключение к интернету и что все файлы сайта (папка assets) опубликованы, затем обновите страницу и повторите попытку. Расчёт на экране остаётся доступным.'
            : 'Не удалось сформировать PDF. Попробуйте ещё раз или скопируйте расчёт кнопкой «Скопировать расчёт».';
          showError(msg);
          toast('Ошибка формирования PDF', true);
        })
        .then(function () { setExporting(false); });
    });

    // Фоновая предзагрузка PDF-модуля после загрузки страницы (один раз)
    var idle = global.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); };
    global.addEventListener('load', function () { idle(function () { loadPdfDeps().catch(function () {}); }); });

    /* ---------- Плавающая сводка ---------- */
    if ('IntersectionObserver' in global) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          els.mobileSummary.classList.toggle('is-hidden', entry.isIntersecting);
        });
      }, { threshold: 0.05 });
      io.observe(els.results.querySelector('.totals'));
    }
    els.mobileSummary.querySelector('a').addEventListener('click', function () {
      setTimeout(function () { els.results.focus({ preventScroll: true }); }, 0);
    });

    render();
    root.setAttribute('data-ready', 'true');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
})(typeof window !== 'undefined' ? window : globalThis);
