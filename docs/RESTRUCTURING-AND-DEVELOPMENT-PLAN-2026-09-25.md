# خطة إعادة هيكلة وتطوير وتنظيف IntelliCanvas — الإصدار 2.0

**تاريخ الخطة:** 2026-09-25  
**نقطة البداية:** الفرع `arena/01a0d5fb-intelli-canvas` (مبني على `18f0bc7`)  
**الحالة الحالية:** 306 اختبار باكند ✅ · 137 اختبار فرونتند ✅ · 12 Playwright suite ✅ · Ruff/Vitest ناجح  
**الهدف النهائي:** مشروع مُهيكل نظيفًا، جاهز للتوسع، مع بنية تطوير واضحة، وبوابة جودة موحدة، وقابل للنشر للإنتاج بثقة.

---

## 0. تشخيص الوضع الحالي

### ما هو جيد بالفعل (يُحفظ ولا يُعاد كتابته)
- **الباكند:** هيكلة طبقات ممتازة بعد إعادة الهيكلة (سبتمبر 2026) — `validation.py`, `error_codes.py` (61 كودًا), `OperationRegistry` موحّد (14 عملية), `domain/results.py`, اختبارات حدود معمارية (`test_architecture.py`) تمنع كسر الفصل.
- **الأمان:** CSRF مزدوج، Rate Limiter، كوكيز HttpOnly، CSP صارم، HSTS، X-Frame-Options.
- **الاختبارات:** تغطية قوية للباكند (306)، ومتصفح (22 Playwright)، ووحدات JS (137).
- **CI:** 3 jobs في GitHub Actions تغطي الباكند والفرونتند والمتصفح.
- **التنسيق:** Ruff شامل للباكند؛ لا توجد `TODO/FIXME/HACK` في الكود.

### المشاكل الفعلية التي تحتاج إلى حل

| # | المشكلة | الموقع | الخطورة |
|---|---|---|---|
| 1 | **ملف `index.html` قديم (700 سطر) في `frontend/`** بجانب `frontend/editor-v2/index.html` — يسبب لبسًا للمطورين؛ الجذر `/` يخدم القديم عكس الوثائق | `frontend/index.html` | متوسط |
| 2 | **ملف `index.html` للواجهة الفعالة (editor-v2) وحده 45KB/169 سطر HTML متداخل** مع كل الـ panels/dialogs/accords — لا تجزئة، لا قوالب، يصعب صيانته | `frontend/editor-v2/index.html` | عال |
| 3 | **`main.js` (277 سطرًا) هو نقطة ربط ضخمة** فيها تهيئة 20+ Manager مع منطق أعمال (upload race، keyboard shortcuts، canvasViewActions) — لا فصل بين bootstrap والتطبيق | `frontend/editor-v2/js/main.js` | عال |
| 4 | **لا يوجد Linter للـ JavaScript** — `package.json` فيه Vitest و Playwright فقط، بلا ESLint/Prettier؛ الكود يُكتب بلا معايير ثابتة | الجذر | متوسط |
| 5 | **مجلدات تخزين الباكند (`backend/storage/*`) متفرعة في شجرة الكود** — منطقياً مكانها أقرب إلى `instance/` أو مسار قابل للضبط عبر env فقط | `backend/storage/` | منخفض |
| 6 | **`pyproject.toml` ناقص** — لا توجد إعدادات pytest/ruff/coverage/pip-audit كاملة، ولا يوجد قسم build system، ولا قيود إصدارات دقيقة | `pyproject.toml` | متوسط |
| 7 | **ملفات التوثيق متراكمة (50+ ملف) بمستويات نضج مختلفة** — وثائق v0.5/v0.6/v0.8 مع وجود `current/` و `docs/current-system-status` القديم والجديد — يسبب تضارباً | `docs/` | متوسط |
| 8 | **خدمات الباكند المتبقية كـ `dict` خام** (Layer, PipelineNode, ImageSession) — تم تأجيل dataclass لها في التقرير السابق، وتوجد 35+ استدعاء `.get()` عبر الخدمات | `backend/app/database.py`, services | متوسط |
| 9 | **لا توجد طبقة تطبيق CLI موحدة** — لا `Makefile`، لا `package.json` scripts شاملة، لا طريقة موحدة لتشغيل الاختبارات/الخادم/الفحوصات | الجذر | منخفض |
| 10 | **Rate Limiter يعمل في الذاكرة فقط** — ينهار مع multiple workers أو إعادة التشغيل؛ غير مناسب للإنتاج | `backend/app/rate_limit.py` | للإنتاج |
| 11 | **ملف `requirements.txt` بدون تثبيت إصدارات دقيقة** (pinned) — يصعب إعادة الإنتاج عبر الزمن | `backend/requirements*.txt` | منخفض |
| 12 | **لا يوجد `instance/` مُدار** — قاعدة البيانات SQLite تنشأ في `instance/` لكن المسار غير منظم ولا يوجد `wsgi.py` أو gunicorn config للنشر | الجذر | للإنتاج |
| 13 | **`main.js` يحمل كل Managers بلا lazy-loading** — كل الأدوات واللوحات تُحمَّل عند فتح المحرر حتى قبل رفع صورة | `frontend/editor-v2/js/main.js` | منخفض (أداء) |
| 14 | **تكرار CSS** — 12 ملف CSS موزعة بدون بنية design-token واضحة، بعض الملفات شاغر تقريباً (`comparison.css` سطر واحد، `tokens.css` 3 أسطر) | `frontend/editor-v2/css/` | منخفض |
| 15 | **لا يوجد Error Boundary / مركزية أخطاء للـ frontend** — الأخطاء تُلتقط بـ `try/catch` متفرقة و `showToast`؛ لا تتبع، لا telemetry، لا تسجيل | JS managers | متوسط |

---

## 1. مبادئ عامة لا تُخالف أثناء التنفيذ

1. **للفرونتند: HTML / CSS / JavaScript Vanilla فقط** — لا ننتقل إلى React/Vue/Svelte. لكن نستخدم **ES Modules بشكل صحيح** ونقسّم الملفات الكبيرة.
2. **للباكند: Flask + Pillow + OpenCV + NumPy** — لا نبدّل الإطار. نكمل مسار إعادة الهيكلة السابق دون كسره.
3. **لا ننقل معالجة البكسلات إلى JavaScript** — JS للمعاينة والتفاعل، Python للنتيجة النهائية المعتمدة.
4. **كل مرحلة في PR مستقل، كل PR يمر عبر بوابة الجودة كاملة (306+137+Playwright)**.
5. **نحافظ على توافق الـ API** — أي تغيير في response shape يكون متوافقاً للخلف أو مُصدّراً بإصدار جديد (`/api/v2/...`).
6. **لا نكسر الاختبارات الحالية** — نضيف اختبارات قبل إعادة الهيكلة، ونحافظ عليها خضراء طوال العمل.
7. **"A test that can find nothing proves nothing"** — كل فحص/اختبار جديد يثبت أنه يرى الكود الذي يفحصه (sentinel).

---

## 2. خطة العمل — 9 مراحل مرتبة

> الترتيب إلزامي: كل مرحلة تعتمد على سابقتها. كل مرحلة متبوعة بـ PR ومراجعة.

---

### المرحلة 1 — تنظيف جذر المستودع وتوحيد أدوات التطوير
**الفرع المقترح:** `chore/1-root-cleanup`  
**الهدف:** جعل جذر المستودع أنيقاً ومنظماً لمطور جديد.

#### المهام
1. **حذف الملفات القديمة غير المستخدمة:**
   - `frontend/index.html` (النسخة العربية القديمة، 699 سطر) — بعد توحيد المسارات.
   - أي ملفات مؤقتة أو `__pycache__` أو `*.pyc` متبقية.
   - ملفات التوثيق القديمة التي تم استبدالها بـ `docs/current/` (انظر المرحلة 7).
2. **إعادة هيكلة شجرة التخزين:**
   - نقل `backend/storage/` إلى `instance/storage/` (متوافق مع ممارسات Flask) مع الحفاظ على ضبط عبر `INTELLICANVAS_STORAGE_ROOT`.
   - نقل قاعدة البيانات إلى `instance/` بشكل صريح.
   - إضافة `.gitkeep` في المجلدات الفارغة.
3. **تطوير `pyproject.toml` ليصبح المصدر الوحيد لإعدادات الباكند:**
   ```toml
   [build-system]
   requires = ["setuptools>=68", "wheel"]
   build-backend = "setuptools.build_meta"

   [project]
   name = "intellicanvas"
   version = "0.9.1"
   requires-python = ">=3.11"
   dependencies = [...]  # من requirements.txt

   [tool.pytest.ini_options]
   pythonpath = ["."]
   testpaths = ["tests"]
   addopts = "-q --strict-markers"

   [tool.ruff]
   target-version = "py311"
   line-length = 100  # زيادة من 88 لتقليل التفاف السطور في الكود الطويل
   extend-exclude = []

   [tool.ruff.lint]
   select = ["E", "F", "W", "I", "BLE", "UP", "B", "SIM"]  # توسيع القواعد

   [tool.coverage.run]
   source = ["backend"]
   omit = ["backend/run.py"]
   ```
4. **إضافة `Makefile`** في الجذر بأوامر موحدة:
   ```makefile
   install:     ## تثبيت كل الاعتماديات (باكند + فرونتند)
   dev:         ## تشغيل خادم التطوير
   test:        ## تشغيل كل الاختبارات (باكند + فرونتند)
   test-py:     ## pytest فقط
   test-js:     ## vitest فقط
   test-e2e:    ## playwright فقط
   lint:        ## ruff check + eslint
   format:      ## ruff format + prettier
   check:       ## lint + test + compileall
   clean:       ## حذف الملفات المولدة
   ```
5. **تطوير `package.json`** بإضافة scripts شاملة:
   ```json
   "scripts": {
     "dev": "cd ../.. && .venv/bin/python backend/run.py",
     "lint": "eslint frontend/editor-v2/js",
     "format": "prettier --write 'frontend/**/*.{js,css,html,md}'",
     "test": "vitest run",
     "test:watch": "vitest",
     "test:browser": "playwright test"
   }
   ```
6. **إضافة `backend/wsgi.py`** لنشر الإنتاج (gunicorn/uwsgi):
   ```python
   from .app import create_app
   app = create_app()
   ```

#### معايير القبول
- `make check` ينجح من checkout نظيف.
- جذر المستودع يحتوي فقط على: `backend/`, `frontend/`, `tests/`, `docs/`, `instance/` (غير متتبعة), وملفات الإعداد (`pyproject.toml`, `package.json`, `Makefile`, `.github/`, `README.md`, `LICENSE`).
- لا يوجد `index.html` قديم في `frontend/`.

---

### المرحلة 2 — بوابة الجودة الموحدة وتثبيت الإصدارات
**الفرع المقترح:** `chore/2-quality-gate`  
**الهدف:** أن أي PR مكسور يُرفض آلياً قبل الدمج، بأعنف معايير ممكنة.

#### المهام
1. **إضافة ESLint + Prettier للفرونتند** (تكوين محافظ — لا يفرض نمطاً ثورياً):
   - `eslint.config.js` بقواعد: `no-unused-vars`, `no-undef`, `no-console` (عدا `console.warn/error`)، `prefer-const`, `eqeqeq`.
   - `.prettierrc` بتنسيق JS/CSS/HTML/MD.
   - تثبيت الإعدادات دون إعادة كتابة الكود دفعة واحدة (قواعد تحذيرية في أول PR، ثم تحويلها إلى errors تدريجياً).
2. **تثبيت إصدارات الاعتماديات (lockfiles):**
   - الباكند: استبدال `requirements.txt` بـ `requirements.lock` (من `pip freeze`)، والاعتماد على `pyproject.toml` للتعريض و `requirements.lock` للإنتاج.
   - أو تبنّي `uv`/`pip-tools` — أوصي بـ **`uv`** لسرعته.
   - الفرونتند: `package-lock.json` موجود بالفعل؛ التأكد من تثبيته في CI.
3. **توسيع `ruff` rules:**
   - تفعيل `B` (bugbear), `UP` (pyupgrade), `SIM` (simplify), `I` (importsort, موجود).
   - معالجة التحذيرات الناتجة (إن وُجدت).
4. **توسيع CI:**
   - إضافة job `lint` منفصل.
   - إضافة `make check` كـ single entry point.
   - إضافة فحص أعمى لتسرب الـ path في الاستجابات (باستخدام AST scan).
   - رفع Artifacts دوماً عند فشل browser tests (لا فقط عند الفشل).
   - إضافة `coverage` للباكند مع عتبة دنيا (مثلاً 80%) — تبدأ كتحذير ثم تُرفع تدريجياً.
5. **إضافة `pre-commit` hooks** للمطورين المحليين:
   ```yaml
   - ruff check/format
   - eslint
   - prettier --check
   - check-merge-conflicts
   - end-of-file-fixer
   - trailing-whitespace
   ```

#### معايير القبول
- `make lint` و `make format` و `make test` تعمل من أوامر واحدة.
- أي كسر لأي قاعدة lint يفشل CI.
- تغطية الباكند ≥ 80%، والفرونتند ≥ 60%.

---

### المرحلة 3 — إعادة هيكلة الباكند: إكمال نموذج المجال (Domain Model)
**الفرع المقترح:** `refactor/3-domain-model`  
**الهدف:** التخلص من آخر `dict[str, Any]` في الخدمات، استكمال ما بدأته إعادة الهيكلة السابقة.

#### المهام
1. **إضافة dataclasses (frozen حيث ممكن) لما تبقى من نماذج المجال:**
   - `backend/app/domain/layer.py` → `Layer(type, layer_id, z_index, visible, opacity, blend_mode, transform, payload, ...)`
   - `backend/app/domain/pipeline.py` → `Pipeline`, `PipelineNode`
   - `backend/app/domain/session.py` → `ImageSession`, `Project`, `User`
   - `backend/app/domain/history.py` → `HistoryEntry`
2. **طبقة Repository محددة المعالم:**
   - استبدال الاستعلامات المباشرة من `SQLiteSessionRepository` بدوال typed:
     - `get_image(image_id) -> ImageSession | None`
     - `list_layers(image_id) -> list[Layer]`
     - `save_layer(layer: Layer) -> None`
   - تحويل JSON serialization/deserialization إلى حدود الـ Repository فقط (لا يخرج `dict` خام إلى الخدمات).
3. **إزالة كل استدعاءات `.get()` العشوائية من الخدمات** (35+ موقع) واستبدالها بوصول حقيقي إلى خصائص dataclass.
4. **كشف استيراد Flask/request في طبقات المجال والعمليات** (موسّع من `test_architecture.py` الموجود).
5. **فصل `AuthService` عن `SQLiteSessionRepository`** — إنشاء `UserRepository` و `AuthSessionRepository` منفصلين (لتسهيل استبدال التخزين لاحقاً).
6. **إزالة أي كود ميت جديد ظهر** بعد التحويل (مشابه لما فُعل في PR #95/#96 من الهيكلة السابقة).

#### معايير القبول
- صفر `dict[str, Any]` في توقيعات الخدمات (باستثناء حدود الشبكة).
- كل نموذج مجال له `to_public_dict()` أو `to_dict()` بحيث لا يتسرب أي حقل سري هيكلياً.
- `test_architecture.py` يُوسَّع لكشف الاستيراد الممنوع في `domain/`.
- جميع اختبارات الباكند (306+) تبقى خضراء.

---

### المرحلة 4 — تقسيم واجهة `editor-v2` (المرحلة الأهم)
**الفرع المقترح:** `refactor/4-frontend-modules`  
**الهدف:** تحويل ملف HTML ضخم و`main.js` متشابك إلى وحدات ES Modules مستقلة، مع دوم منظم.

#### المهام
1. **تقسيم `frontend/editor-v2/index.html` (45KB) إلى أجزاء جزئية:**
   - بما أننا نستخدم Vanilla JS بدون bundler، سنستخدم نهج **`<template>` + client-side hydration** أو نهج **HTML partials محمّلة ديناميكياً** عبر `fetch()` عند الحاجة (لتقليل الحجم الأولي).
   - أو (الأبسط): تنظيم HTML بتعليقات `<!-- section: name -->` واضحة، وفصل الأجزاء في ملفات HTML جانبية لكل panel تُحمّل عند تفعيلها لأول مرة.
   
   البنية المقترحة:
   ```
   editor-v2/
     index.html            # الهيكل العظمي فقط: header, tool-rail, workspace, مكان للـ panels
     templates/
       auth.html           # بوابة المصادقة
       canvas.html         # canvas zone + toolbars
       dialogs/
         resize.html
         export.html
         confirm.html
         shortcuts.html
         help.html
         text-popover.html
       panels/
         edit.html         # Edit panel (context + quick actions + adjustments accordions)
         layers.html
         insights.html
         history.html
         pipeline.html
     js/
       bootstrap.js        # تحميل القوالب وتهيئة التطبيق (بدلاً من main.js)
       app.js              # App class يدير دورة حياة التطبيق
       lib/                # مكتبات مشتركة
         dom.js            # helpers لـ DOM (qs, qsa, el, escapeHtml)
         events.js         # EventBus مركزي
         errors.js         # ErrorBoundary / خطأ موحد
       core/
         api-client.js
         app-state.js
         operation-state.js
       ui/                 # ما يتعلق بالواجهة العامة
         theme-manager.js
         ui-manager.js
         icons.js
         dialog-manager.js
         toast.js
       canvas/             # أدوات القماش
         canvas-manager.js
         crop-tool.js
         resize-tool.js
         transform-logic.js
         transform-tools.js
         comparison-tool.js
       tools/              # الأدوات التفاعلية
         object-manager.js
         layer-manager.js
       panels/             # لوحات Inspector
         adjustments-manager.js
         filters-manager.js
         background-manager.js
         analysis-manager.js
         history-manager.js
         pipeline-manager.js
         export-manager.js
         smart-crop-manager.js
         inspector-context.js
         inspector-context-view.js
       tools/drawing/
         brush-tool.js
         eraser-tool.js
         shape-tool.js
         text-tool.js
       entry/
         upload.js
         keyboard-shortcuts.js
     css/
       tokens.css          # ألوان ومسافات وخطوط
       base.css            # reset + typography
       layout.css          # شبكة التخطيط
       components/         # مكونات صغيرة
         button.css
         dialog.css
         panel.css
         toast.css
         toolbar.css
       features/           # ميزات محددة
         auth.css
         canvas.css
         inspector.css
         history.css
         smart-crop.css
         mobile-drawer.css
         help.css
         comparisons.css
       responsive.css
     assets/
       logos, PDF guide
   ```
2. **إنشاء `EventBus` مركزي بدلاً من `document.dispatchEvent` المشتت:**
   ```js
   // js/lib/events.js
   export const bus = {
     on(event, handler) { ... },
     off(event, handler) { ... },
     emit(event, payload) { ... },
   };
   ```
   استبدال `ic-operation`, `appstatechange` به.
3. **إنشاء `App` class يدير دورة الحياة:**
   ```js
   export class App {
     constructor(config) { ... }
     async init() { ... }      # auth → load templates → init managers
     destroy() { ... }
     getService(name) { ... }  # للوصول إلى managers من بعضها
   }
   ```
4. **فصل `upload.js` عن `main.js`** — منطق السباق، dropzone، file input.
5. **فصل `keyboard-shortcuts.js`** — جميع اختصارات لوحة المفاتيح في ملف واحد قابل للاختبار.
6. **فصل `dialog-manager.js`** — فتح/إغلاق dialogs مع focus trap و Escape و aria من مكان مركزي.
7. **`toast.js` منفصل** (موجود حالياً داخل ui-manager).
8. **ErrorBoundary موحد:**
   ```js
   export function handleError(error, context) {
     console.error(`[${context}]`, error);
     showToast(error.message || 'An error occurred');
     bus.emit('error', { error, context });
   }
   ```
9. **Lazy-loading للـ Panels:** لا تُحمَّل `pipeline-manager` و`analysis-manager` و`background-manager` حتى يفتح المستخدم الـ tab لأول مرة.
10. **تحديث `index.html` لتحميل `bootstrap.js` فقط**، ويقوم هو بالباقي.

#### معايير القبول
- أي ملف JS جديد ≤ 300 سطر (باستثناء الأدوات المعقدة مثل `object-manager` بحد أقصى 500).
- لا يوجد `document.querySelector` متناثر خارج `ui/` و `canvas/` — استخدم `dom.js` helpers.
- لا تحميل غير ضروري لمديرين قبل رفع صورة.
- جميع اختبارات Vitest الحالية (137) تبقى خضراء بعد التعديل.
- يمكن فتح المحرر وتنفيذ سير العمل كاملاً (رفع → تعديل → تصدير) دون أخطاء في الكونسول.

---

### المرحلة 5 — إكمال هرم الاختبارات
**الفرع المقترح:** `test/5-test-pyramid`  
**الهدف:** تغطية كل manager فرونتند باختبارات Vitest، وتوسيع اختبارات المتصفح، وبناء ثقة كاملة.

#### المهام
1. **تغطية Vitest المتبقية (المذكور في `system-status.md` كبند متبقٍ):**
   - `pipeline-manager.test.js` (حالة معقدة + معاينة + تطبيق + أخطاء)
   - `canvas-manager.test.js` (zoom, pan, fit, actualPixels)
   - `layer-manager.test.js` (إضافة، إزالة، ترتيب، إخفاء)
   - `background-manager.test.js` (preview, remove, replace مع mask)
   - `analysis-manager.test.js` (analyze, accept suggestion, dismiss)
   - `export-manager.test.js` (تنسيقات، جودة، أبعاد)
   - `comparison-tool.test.js` (split handle)
   - `smart-crop-manager.test.js` (preview, apply, aspect ratios)
   - `object-manager.test.js` موجود مسبقاً (12) — التأكد من تغطية الأدوات (brush, shape, text).
   
   الهدف: ≥ 250 اختبار Vitest، تغطية لكل manager.
2. **تحديث اختبارات Playwright:**
   - التأكد من أن كل مدير جديد/مُعاد هيكلته له تدفق متصفح واحد على الأقل.
   - إضافة اختبارات للـ ErrorBoundary (محاكاة فشل API).
   - إضافة اختبار للوحة المفاتيح الكامل (كل shortcut).
   - اختبار استجابة أعمق (mobile drawer في أجهزة متعددة).
3. **اختبارات معمارية للفرونتند** (مشابهة لـ `test_architecture.py` للباكند):
   - كتابة اختبار Vitest يفحص AST لملفات JS ويرفض:
     - استيراد مديرين من بعضهما دائرياً
     - وصول مباشر إلى `window` أو `document` من خارج `ui/` و `canvas/`
     - استخدام `innerHTML` مع بيانات غير مهربة
4. **تغطية الباكند:**
   - الوصول إلى ≥ 85% (حالياً 80% تقريباً).
   - إضافة اختبارات لـ `smart-crop-service`, `explainability-service`, `suggestion-service` بحدود.
5. **تقارير التغطية:**
   - توليد HTML report محلياً (`make coverage`).
   - نشر تقرير التغطية كـ artifact في CI.

#### معايير القبول
- ≥ 250 اختبار Vitest (من 137 حالياً).
- ≥ 400 اختبار pytest (من 306 حالياً).
- ≥ 30 اختبار Playwright (من 22 حالياً).
- تغطية باكند ≥ 85%، فرونتند ≥ 70%.
- كل اختبار جديد يثبت أنه يفحص شيئاً (sentinel assertion).

---

### المرحلة 6 — توثيق موحد ومنظم
**الفرع المقترح:** `docs/6-docs-cleanup`  
**الهدف:** مطور جديد يفتح `docs/` ويفهم المشروع في 10 دقائق دون تشويش وثائق قديمة.

#### المهام
1. **تنظيف `docs/` وإعادة هيكلته:**
   ```
   docs/
     README.md                      # دليل البداية السريعة
     getting-started/
       installation.md
       running-locally.md
       development-workflow.md
     architecture/
         01-overview.md
         02-frontend.md
         03-backend.md
         04-security.md
         05-data-model.md
         06-image-processing.md
     features/                      # وثائق feature بزمن الميزة
       editor-v2.md
       layers.md
       background-studio.md
       history.md
       pipeline.md
       image-intelligence.md
       smart-crop.md
     api/
         README.md
         endpoints.md
         authentication.md
         errors.md
     development/
       testing.md
       style-guide-js.md
       style-guide-python.md
       git-workflow.md
       release-process.md
     status/
         CHANGELOG.md
         current-state.md            # يحل محل system-status.md
     archive/                        # الوثائق القديمة (لا تحذف — تؤرشف)
       01-project-vision.md
       02-requirements.md
       ...rest من القديم
   ```
2. **نقل كل الوثائق التاريخية القديمة إلى `docs/archive/`** دون حذفها.
3. **كتابة `docs/README.md`** طازج يوجّه القارئ:
   - كيف أبدأ؟ (5 دقائق)
   - كيف أضيف ميزة؟
   - أين أجد بنية الكود؟
   - كيف أشغّل الاختبارات؟
4. **تحديث `README.md` الرئيسي** ليكون موجزاً ويربط إلى الوثائق التفصيلية.
5. **`CONTRIBUTING.md`** في الجذر يصف كيف يقدم المطورون (fork/branch/PR checklist).
6. **`CHANGELOG.md`** في الجذر يتبع [Keep a Changelog](https://keepachangelog.com/) — لا يبدأ من الصفر، لكن من الإصدار القادم.
7. **تحديث وثائق الـ API** لتكون مولّدة من الـ operation registry (جزئياً) — لا يوجد OpenAPI كامل الآن، لكن ملف `docs/api/endpoints.md` يُحدّث من `/api/capabilities`.

#### معايير القبول
- أي وثيقة في `docs/` خارج `archive/` تصف الوضع **الحالي** (v0.9.1+) — لا توجد وثيقة تصف شيئاً `501 Not Implemented` إذا كان منفذاً.
- `docs/archive/` يحوي كل الوثائق القديمة (لا حذف).
- `README.md` ≤ 150 سطر.
- Developer جديد يستطيع تنصيب المشروع وتشغيله من الصفر باتباع `docs/getting-started/` دون سؤال.

---

### المرحلة 7 — تقوية الأمان وجاهزية الإنتاج
**الفرع المقترح:** `prod/7-production-hardening`  
**الهدف:** نشر IntelliCanvas على خادم عام دون مخاطر معروفة.

#### المهام
1. **Rate Limiter قابل للتوسع:**
   - إضافة واجهة `RateLimiter` (مثل `InMemoryRateLimiter` الحالي)، مع تطبيق إضافي بـ **Redis** (مفعل فقط عند ضبط `REDIS_URL`).
2. **إضافة `FLASK_ENV` حقيقي:**
   - عند `INTELLICANVAS_ENV=production` يُتطلب:
     - `SECRET_KEY` غير افتراضي (موجود).
     - `AUTH_COOKIE_SECURE=1` (موجود).
     - خادم WSGI مناسب (gunicorn) — إضافة `gunicorn.conf.py`.
     - تعطيل CSP `'unsafe-inline'` إن استطعنا (خطوة كبيرة، تؤجل إذا احتاجت تغييرات JS كثيرة).
3. **ملف إعداد Gunicorn:**
   ```python
   # backend/gunicorn.conf.py
   bind = "127.0.0.1:5000"
   workers = 4
   worker_class = "gthread"
   threads = 2
   timeout = 60
   max_requests = 1000
   max_requests_jitter = 50
   ```
4. **إضافة `/api/health/ready` و `/api/health/live`** (checks منفصلة للـ Kubernetes/proxy).
5. **Request logging موحد** (بصيغة متوافقة مع 12-factor: JSON في الإنتاج، نص عادي في التطوير).
6. **تحسين إعدادات CSP:**
   - `'unsafe-inline'` في style-src يُستبدل بـ nonces إن أمكن.
   - إضافة `report-uri` لاستقبال تقارير CSP في الإنتاج.
7. **Security headers محسّنة:**
   - `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` إذا كانت مناسبة.
8. **File upload validation أعمق:**
   - فحص السحر (magic bytes) بدلاً من الاعتماد على Content-Type والامتداد فقط.
   - رفض الصور المتلاعبة (image bombs) عبر حد أقصى للأبعاد (موجود مسبقاً في `MAX_IMAGE_PIXELS` — التأكد من تطبيقه على كل المسارات).
9. **Flask session cookie** منفصلة عن `ic_session` إن وُجدت (لتفادي تسرب CSRF).
10. **Dependency scanning:**
    - `pip-audit` موجود في CI.
    - إضافة `npm audit` لفحص فرونتند.
    - إعداد Dependabot/GitHub Dependabot Alerts.

#### معايير القبول
- `gunicorn backend.wsgi:app` يقلع بنجاح ويخدم الطلبات.
- لا تحذيرات أمان عند المرور على فحص OWASP ZAP الأساسي.
- أي اعتمادية بها ثغرة معروفة تفشل CI.

---

### المرحلة 8 — طبقة ذكاء وتجربة مستخدم محسنة
**الفرع المقترح:** `feat/8-smart-ux`  
**الهدف:** تحسينات UX وذكاء، بعد استقرار البنية.

#### المهام (اختيارية وتدريجية)
1. **Command palette** (Ctrl+K) للوصول السريع للأدوات والإجراءات.
2. **Auto-save drafts** في `localStorage` كحماية من إغلاق التبويب.
3. **Multi-image projects / Projects panel** — البنية التحتية (`projects` table موجودة في قاعدة البيانات لكن غير مستغلة).
4. **Presets للتعديلات** (Cinema, B&W, Vivid, Soft) — باستخدام Pipeline المخزنة.
5. **Quality gates** (هل هذه الصورة جاهزة للنشر؟) مبنية على analysis الموجود.
6. **Batch processing** من خلال Pipeline (مشار إليه في roadmap القديم).
7. **Keyboard shortcut customizer** (متقدم).
8. **Dark/light theme switch** محسّن مع system preference احترام كامل (يوجد حالياً بشكل أساسي).
9. **Image zoom with Ctrl+Wheel** (موجود جزئياً في النص السفلي، التأكد من اكتماله).
10. **Touch gestures** (pinch-to-zoom بإصبعين) للأجهزة اللمسية.

---

### المرحلة 9 — إصلاحات ما بعد الإطلاق والملمعات النهائية
**الفرع المقترح:** `polish/9-post-launch`  
**الهدف:** قبل إصدار v1.0.

- تدقيق شامل لكل النصوص في الواجهة (إنجليزية + خطة للتعريب/العربية).
- مراجعة الوصولية (Accessibility) — ARIA labels، focus order، contrast (يوجد فحص `aria.spec.js` — التوسع فيه).
- تحسين الأداء:
  - `content-visibility: auto` للألواح غير الظاهرة.
  - تقليل repaints على canvas.
  - Compression للصور المصدرة عند الحاجة.
- إرشادات الإنتاج النهائية (nginx config, HTTPS, systemd unit, Docker).
- إعداد `Dockerfile` + `docker-compose.yml` للنشر السهل.
- خطة النسخ الاحتياطي (SQLite snapshots + storage backups).
- إصدار v1.0.0 مع tag وGitHub release.

---

## 3. التبعيات بين المراحل

```
المرحلة 1 (root cleanup)
    ↓
المرحلة 2 (quality gate)
    ↓
المرحلة 3 (backend domain model) ─┐
    ↓                              │
المرحلة 4 (frontend modules)   ←───┘ (تتقدم بالتوازي ممكن بعد 2)
    ↓
المرحلة 5 (tests)
    ↓
المرحلة 6 (docs) ← يمكن أن تعمل مبكراً لكن تُراجَع بعد 3+4
    ↓
المرحلة 7 (production hardening)
    ↓
المرحلة 8 (smart UX features)
    ↓
المرحلة 9 (polish + v1.0)
```

**المرحلتان 3 و 4** يمكن أن تعملا **بالتوازي** لأنهما تلمسان طبقتين منفصلتين (باكند وفرونتند)، على فرعين منفصلين، بعد إنهاء المرحلتين 1 و2.

---

## 4. المخرجات المتوقعة في نهاية المشروع

- ✅ مستودع منظم ببنية واضحة في الجذر.
- ✅ `pyproject.toml` و `package.json` و `Makefile` ك entry-points موحدة.
- ✅ باكند كامل typed domain model بدون `dict` خام.
- ✅ فرونتند مقسم إلى modules مسؤولة، لا ملفات HTML/JS ضخمة متداخلة.
- ✅ ≥ 650 اختبار آلي (400 pytest + 250 Vitest + 30 Playwright).
- ✅ ESLint + Prettier + Ruff + coverage gate في CI.
- ✅ توثيق منظم في `docs/` بدون وثائق مضللة.
- ✅ قابل للنشر بـ gunicorn + nginx + Redis اختياري.
- ✅ Docker ready.
- ✅ أساس للميزات الذكية في المرحلة 8.

---

## 5. مخاطر وتخفيفها

| المخطر | التخفيف |
|---|---|
| المرحلة 4 (تقسيم HTML/JS) تكسر الاختبارات الحالية | العمل بفروع صغيرة، اختبارات E2E تُشغَّل بعد كل commit، عدم تغيير السلوك الوظيفي فقط التنظيم |
| Domain model (المرحلة 3) تسبب تسرب بيانات أو تغيير سلوك | إضافة tests للـ Repository layer، استخدام frozen dataclasses، عدم تغيير استجابات API |
| تفعيل ESLint قواعد صارمة يسبب آلاف الأخطاء | البدء بـ warnings فقط، وتفعيل قاعدة قاعدة تدريجياً عبر PRs منفصلة |
| الحذف العشوائي للملفات القديمة يكسر شيئاً ما | استخدام grep/references قبل الحذف، والتحقق من الجذر `/` والـ `/editor-v2/` بعد كل حذف |
| ESLint config يختلف بين المطورين | تثبيت الإعدادات في repo وتشغيلها في CI كـ source of truth |

---

## 6. الخطوة الأولى الفورية

المرحلة **1-A** هي الخطوة التي ستبدأ بها إذا وافقت على الخطة:

1. إنشاء الفرع `chore/1-root-cleanup`.
2. إضافة `Makefile` بأوامر موحدة.
3. نقل `backend/storage/` إلى `instance/storage/`.
4. إزالة `frontend/index.html` القديم بعد التأكد من أن `/` يوجه إلى editor-v2 (وهو يفعل ذلك حالياً؟ — فلنتحقق في بداية التنفيذ).
5. إضافة `backend/wsgi.py`.
6. تشغيل كل الاختبارات للتأكد من عدم كسر شيء.

---

## 7. كيف نبدأ الآن؟

إذا وافقت على هذه الخطة، يمكننا أن:

- 🅰️ **نبدأ مباشرة بالمرحلة 1** (تنظيف الجذر و Makefile) — خطوة عملية الآن.
- 🅱️ **نبدأ بالمرحلة 4 أولاً** لأن تقسيم الـ frontend هو الأكثر أثراً UX-wise.
- 🅲️ **نعدّل الخطة** بناء على أولوياتك (مثلاً: هل تريد التركيز على جاهزية الإنتاج أولاً؟ أم الميزات الجديدة؟).
- 🅳️ **تقسيم المراحل إلى مراحل أصغر** إذا رأيت بعضها طموحاً جداً.

أخبرني بأي خيار تريد أو بأي تعديل على الخطة قبل البدء بالتنفيذ.
