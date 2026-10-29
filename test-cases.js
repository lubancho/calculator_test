/* Приёмочные тест-кейсы из ТЗ (раздел 11) + пограничные сценарии.
   Используются и в Node (calculator.test.js), и в браузере (run-in-browser.html). */
(function (global) {
  'use strict';

  var ALL = ['form', 'catalog', 'payment', 'crm', 'multilingual'];

  var acceptance = [
    { id: 'TC-01', title: 'Лендинг, 1 страница, стандарт', params: { projectType: 'landing', pages: 1, features: [], urgency: 'standard' }, price: 35000, days: 7 },
    { id: 'TC-02', title: 'Корпоративный, 8 страниц, стандарт', params: { projectType: 'corporate', pages: 8, features: [], urgency: 'standard' }, price: 92000, days: 18 },
    { id: 'TC-03', title: 'Лендинг, форма + CRM', params: { projectType: 'landing', pages: 1, features: ['form', 'crm'], urgency: 'standard' }, price: 55000, days: 11 },
    { id: 'TC-04', title: 'Интернет-магазин, 10 страниц, ускоренный', params: { projectType: 'shop', pages: 10, features: [], urgency: 'fast' }, price: 180000, days: 20 },
    { id: 'TC-05', title: 'Корпоративный, 1 страница', params: { projectType: 'corporate', pages: 1, features: [], urgency: 'standard' }, price: 80000, days: 15 },
    { id: 'TC-06', title: 'Лендинг, 1 страница, срочный', params: { projectType: 'landing', pages: 1, features: [], urgency: 'urgent' }, price: 49000, days: 5 },
    { id: 'TC-07', title: 'Корпоративный, 8 страниц, CRM, ускоренный', params: { projectType: 'corporate', pages: 8, features: ['crm'], urgency: 'fast' }, price: 128400, days: 17, urgencyExtra: 21400, subtotal: 107000 },
    // В ТЗ указано 120 000 ₽ — арифметическая ошибка: функции стоят 85 000 ₽, а не 80 000 ₽
    { id: 'TC-08', title: 'Лендинг, 2 страницы, все функции, стандарт (исправлено: 125 000 ₽ вместо 120 000 ₽)', params: { projectType: 'landing', pages: 2, features: ALL, urgency: 'standard' }, price: 125000, days: 23, featuresPrice: 85000 }
  ];

  var extra = [
    // Ловушки плавающей точки: 20 × 0,65 = 13,000000000000002 → должно быть 13
    { id: 'EX-01', title: 'Корпоративный 10 стр., срочный: ceil(20 × 0,65) = 13', params: { projectType: 'corporate', pages: 10, features: [], urgency: 'urgent' }, price: 140000, days: 13 },
    { id: 'EX-02', title: 'Магазин 11 стр. (полдня), стандарт: ceil(25,5) = 26', params: { projectType: 'shop', pages: 11, features: [], urgency: 'standard' }, price: 153000, days: 26 },
    { id: 'EX-03', title: 'Магазин 12 стр., стандарт: 26 дней ровно', params: { projectType: 'shop', pages: 12, features: [], urgency: 'standard' }, price: 156000, days: 26 },
    { id: 'EX-04', title: 'Магазин 100 стр., все функции, срочный', params: { projectType: 'shop', pages: 100, features: ALL, urgency: 'urgent' }, price: Math.round((150000 + 90 * 3000 + 85000) * 1.4), days: Math.ceil((25 + 45 + 15) * 0.65) },
    { id: 'EX-05', title: 'Дубли функций не накапливаются', params: { projectType: 'landing', pages: 1, features: ['crm', 'crm', 'form', 'crm', 'unknown'], urgency: 'standard' }, price: 55000, days: 11 },
    { id: 'EX-06', title: 'Магазин 5 стр. (меньше базовых) — без снижения', params: { projectType: 'shop', pages: 5, features: [], urgency: 'standard' }, price: 150000, days: 25 },
    { id: 'EX-07', title: 'Лендинг, ускоренный: ceil(7 × 0,8) = 6', params: { projectType: 'landing', pages: 1, features: [], urgency: 'fast' }, price: 42000, days: 6 }
  ];

  var pagesInput = [
    { raw: '0', fallback: 5, value: 1, corrected: true },
    { raw: '-7', fallback: 5, value: 1, corrected: true },
    { raw: '2.5', fallback: 5, value: 3, corrected: true },
    { raw: '2,4', fallback: 5, value: 2, corrected: true },
    { raw: '101', fallback: 5, value: 100, corrected: true },
    { raw: '100000', fallback: 5, value: 100, corrected: true },
    { raw: '', fallback: 8, value: 8, corrected: true },
    { raw: '   ', fallback: 8, value: 8, corrected: true },
    { raw: 'abc', fallback: 8, value: 8, corrected: true },
    { raw: '1e3', fallback: 8, value: 8, corrected: true },
    { raw: ' 42 ', fallback: 8, value: 42, corrected: false },
    { raw: '100', fallback: 8, value: 100, corrected: false },
    { raw: '1', fallback: 8, value: 1, corrected: false }
  ];

  var data = { acceptance: acceptance, extra: extra, pagesInput: pagesInput, ALL: ALL };
  global.CALC_TEST_CASES = data;
  if (typeof module === 'object' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
