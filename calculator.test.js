/* Модульные тесты бизнес-логики. Запуск: node --test tests/  (Node.js 18+) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../script.js');
const cases = require('./test-cases.js');

const NBSP = ' ';
const plain = (s) => s.replace(/[  ]/g, ' ');

for (const tc of [...cases.acceptance, ...cases.extra]) {
  test(`${tc.id}: ${tc.title}`, () => {
    const r = calc.calculate(tc.params);
    assert.equal(r.totalPrice, tc.price, 'стоимость');
    assert.equal(r.totalDuration, tc.days, 'срок');
    if (tc.urgencyExtra !== undefined) assert.equal(r.urgencyExtra, tc.urgencyExtra, 'наценка');
    if (tc.subtotal !== undefined) assert.equal(r.subtotal, tc.subtotal, 'базовая сумма');
    if (tc.featuresPrice !== undefined) assert.equal(r.featuresPrice, tc.featuresPrice, 'функции');
    // Согласованность для PDF: сумма строк = итог
    const rows = calc.verifyResult(r);
    assert.equal(rows.reduce((s, x) => s + x.amount, 0), r.totalPrice);
  });
}

test('Структура результата соответствует примеру из ТЗ (п. 5.3)', () => {
  const r = calc.calculate({ projectType: 'corporate', pages: 8, features: [], urgency: 'standard' });
  const expected = { projectType: 'corporate', pages: 8, extraPages: 3, selectedFeatures: [], urgency: 'standard',
    basePrice: 80000, pagesPrice: 12000, featuresPrice: 0, subtotal: 92000, urgencyExtra: 0, totalPrice: 92000,
    baseDuration: 18, totalDuration: 18 };
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(r[k], v, k);
});

for (const c of cases.pagesInput) {
  test(`Нормализация страниц: «${c.raw}» → ${c.value}`, () => {
    const res = calc.normalizePages(c.raw, c.fallback);
    assert.equal(res.value, c.value);
    assert.equal(res.corrected, c.corrected);
    if (c.corrected) assert.ok(res.message.length > 0);
  });
}

test('calculate() нормализует некорректные страницы сам', () => {
  assert.equal(calc.calculate({ projectType: 'landing', pages: -5, features: [], urgency: 'standard' }).pages, 1);
  assert.equal(calc.calculate({ projectType: 'landing', pages: 1000, features: [], urgency: 'standard' }).pages, 100);
  assert.equal(calc.calculate({ projectType: 'landing', pages: 3.7, features: [], urgency: 'standard' }).pages, 4);
});

test('Неизвестные тип и срочность отклоняются', () => {
  assert.throws(() => calc.calculate({ projectType: 'x', pages: 1, features: [], urgency: 'standard' }));
  assert.throws(() => calc.calculate({ projectType: 'landing', pages: 1, features: [], urgency: 'x' }));
});

test('Форматирование суммы: Intl ru-RU и неразрывный пробел перед ₽', () => {
  assert.equal(plain(calc.formatMoney(125000)), '125 000 ₽');
  assert.ok(calc.formatMoney(5000).endsWith(NBSP + '₽'));
});

test('Склонения сроков', () => {
  assert.equal(plain(calc.formatDays(1)), '1 рабочий день');
  assert.equal(plain(calc.formatDays(23)), '23 рабочих дня');
  assert.equal(plain(calc.formatDays(17)), '17 рабочих дней');
  assert.equal(plain(calc.formatDays(11)), '11 рабочих дней');
});

test('Пояснение для примера из ТЗ', () => {
  const r = calc.calculate({ projectType: 'corporate', pages: 8, features: [], urgency: 'standard' });
  assert.equal(plain(calc.buildExplanation(r)),
    'Выбран корпоративный сайт на 8 страниц. В базовую стоимость включено 5 страниц, поэтому дополнительно рассчитаны 3 страницы. Дополнительные функции не выбраны. Проект выполняется в стандартные сроки.');
});

test('Пояснение: страниц меньше базового', () => {
  const r = calc.calculate({ projectType: 'corporate', pages: 1, features: [], urgency: 'standard' });
  assert.match(plain(calc.buildExplanation(r)), /включено до 5 страниц/);
  assert.match(plain(calc.buildExplanation(r)), /на 1 страницу/);
});

test('Пояснение: функции и срочность', () => {
  const r = calc.calculate({ projectType: 'landing', pages: 2, features: ['crm', 'form'], urgency: 'urgent' });
  const t = plain(calc.buildExplanation(r));
  assert.match(t, /на 2 страницы/);
  assert.match(t, /рассчитана 1 страница/);
  assert.match(t, /Дополнительные функции: форма заявки, интеграция с CRM\./);
  assert.match(t, /«Срочная»/);
});

test('Текст для копирования содержит все обязательные поля (TC-07)', () => {
  const r = calc.calculate({ projectType: 'corporate', pages: 8, features: ['crm'], urgency: 'fast' });
  const t = plain(calc.buildCopyText(r));
  for (const s of ['Тип сайта: Корпоративный сайт', 'Количество страниц: 8', 'Интеграция с CRM', 'Срочность: Ускоренная',
    'Базовый тип сайта', ': 80 000 ₽', '(3 × 4 000 ₽): 12 000 ₽', 'Дополнительные функции: 15 000 ₽',
    'Наценка за срочность (+20%): 21 400 ₽', 'Итоговая стоимость: 128 400 ₽', 'Ориентировочный срок: 17 рабочих дней',
    'Расчёт носит предварительный характер']) {
    assert.ok(t.includes(s), 'нет: ' + s);
  }
});

test('Текст для копирования без функций', () => {
  const t = plain(calc.buildCopyText(calc.calculate({ projectType: 'landing', pages: 1, features: [], urgency: 'standard' })));
  assert.ok(t.includes('Дополнительные функции: не выбраны'));
});

test('Строки PDF для TC-07 совпадают с примером ТЗ', () => {
  const rows = calc.buildPdfRows(calc.calculate({ projectType: 'corporate', pages: 8, features: ['crm'], urgency: 'fast' }));
  assert.deepEqual(rows.map((r) => [plain(r.name), r.qty, r.amount]), [
    ['Разработка корпоративного сайта (включено 5 страниц)', 1, 80000],
    ['Дополнительные страницы (4 000 ₽ за страницу)', 3, 12000],
    ['Интеграция с CRM', 1, 15000],
    ['Ускоренное выполнение (+20%)', 1, 21400]
  ]);
});

test('PDF не содержит фиктивных позиций для базового расчёта', () => {
  const rows = calc.buildPdfRows(calc.calculate({ projectType: 'landing', pages: 1, features: [], urgency: 'standard' }));
  assert.equal(rows.length, 1);
  assert.equal(plain(rows[0].name), 'Разработка лендинга (включена 1 страница)');
});

test('Номер оценки и имя файла', () => {
  const d = new Date(2026, 9, 29, 9, 5, 7);
  assert.equal(calc.buildEstimateNumber(d), 'EST-20261029-090507');
  assert.equal(calc.buildFileName(d), 'Website_Estimate_2026-10-29.pdf');
});

test('Изменение CONFIG меняет расчёт без правки логики', () => {
  const t = calc.CONFIG.projectTypes.landing;
  const saved = t.price;
  t.price = 40000;
  try {
    assert.equal(calc.calculate({ projectType: 'landing', pages: 1, features: [], urgency: 'standard' }).totalPrice, 40000);
  } finally { t.price = saved; }
});

test('«Что входит в работы» — только выбранные позиции', () => {
  const base = calc.buildScopeRows(calc.calculate({ projectType: 'landing', pages: 1, features: [], urgency: 'standard' }));
  assert.equal(base.length, 1);
  const full = calc.buildScopeRows(calc.calculate({ projectType: 'corporate', pages: 8, features: ['crm', 'form'], urgency: 'fast' }));
  assert.deepEqual(full.map((x) => x.title), ['Разработка корпоративного сайта', 'Дополнительные страницы (3)', 'Форма заявки', 'Интеграция с CRM', 'Ускоренное выполнение']);
  assert.ok(full.every((x) => x.text.length > 20));
});

test('Формула срока читается для всех веток', () => {
  const f = (p) => plain(calc.buildDurationFormula(calc.calculate(p)));
  assert.equal(f({ projectType: 'landing', pages: 1, features: [], urgency: 'standard' }), '7 рабочих дней — срок базового тарифа');
  assert.equal(f({ projectType: 'corporate', pages: 8, features: [], urgency: 'standard' }), '15 (база) + 3 (страницы) = 18 рабочих дней');
  assert.equal(f({ projectType: 'landing', pages: 1, features: [], urgency: 'fast' }), '7 (база) × 0,8, округление вверх → 6 рабочих дней');
  assert.equal(f({ projectType: 'shop', pages: 11, features: [], urgency: 'standard' }), '25 (база) + 0,5 (страницы) = 25,5, округление вверх → 26 рабочих дней');
});
