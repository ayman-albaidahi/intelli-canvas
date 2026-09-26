# IntelliCanvas — تقرير فحص المستودع والاقتراحات

**تاريخ الفحص:** 2026-09-27  
**الفرع المفحوص:** `origin/main` عند commit `4e8d0ce`  
**فرع التقرير:** `docs/repository-audit-2026-09-27`

## 1. ملخص الحالة الحالية

- لا توجد Pull Requests مفتوحة وقت الفحص.
- آخر التحديثات المدمجة في `main` هي:
  - **PR #139:** إضافة خطة إعادة الهيكلة والتطوير بتاريخ 2026-09-25.
  - **PR #141:** تفعيل quality gate، ESLint، توسيع قواعد Ruff، coverage backend، وlockfile.
  - التحديثات السابقة تشمل إصلاح HTML وتبويبات Inspector، توحيد الهوية اللونية، وإزالة ألوان pink القديمة.
- آخر تشغيلات CI الظاهرة في GitHub كانت ناجحة، بما في ذلك تشغيل `main` وتشغيل PRs الأخيرة.
- عدد الاختبارات في checkout الحالي:
  - **315 اختبار Python** — ناجحة.
  - **150 اختبار Vitest** — ناجحة.
  - **22 ملف Playwright spec** موجودة في المستودع؛ لم يُعاد تشغيل suite المتصفح ضمن هذا التدقيق بسبب زمن التشغيل الطويل، لكن آخر CI منشور على `main` ناجح.
- فحص Ruff وRuff format وESLint مضمّنة الآن في CI وMakefile.

## 2. ما تم التحقق منه

### 2.1 جودة الكود والاختبارات

تم تشغيل:

```text
pytest -q
npm run test:frontend
```

والنتيجة:

```text
315 passed
150 passed
```

كما أن Ruff أبلغ عن نجاح الفحص، وRuff format أبلغ أن الملفات منسقة.

### 2.2 ملاحظة حول `make check`

تم تشغيل:

```text
make check
```

وتوقف عند أمر coverage بسبب أن بيئة التدقيق الحالية لا تحتوي على plugin `pytest-cov`:

```text
pytest: error: unrecognized arguments: --cov=backend --cov-report=term-missing
```

هذا **ليس دليلاً على فشل مستودع نظيف**؛ فـ`pytest-cov` موجود في `backend/requirements-dev.txt` وCI يثبّت متطلبات التطوير. لكنه يثبت أن أمر `make check` يحتاج إلى بيئة dependencies كاملة، وأن رسالة الخطأ الحالية ليست واضحة للمطور الذي لم ينفذ `make install` أولاً.

### 2.3 إعادة تنظيم التخزين

الكود الحالي يستخدم `instance/` افتراضيًا لقاعدة البيانات والتخزين، ويدعم:

```text
INTELLICANVAS_DATABASE_PATH
INTELLICANVAS_STORAGE_ROOT
```

كما أضيف `backend/wsgi.py`، وهذا يعالج جزءًا مهمًا من خطة إعادة الهيكلة. أثناء الفحص ظهرت ملفات runtime محلية غير متتبعة تحت `backend/storage/` نتيجة تشغيلات سابقة. هذه الملفات ليست جزءًا من `main`، لكنها تكشف أن checkout المحلي قد يحمل بقايا من بنية التخزين القديمة.

## 3. اقتراحات التحسين ذات الأولوية

### P1 — توحيد CI مع `make check`

**الملاحظة:** يوجد الآن `Makefile` يعرّف quality gate، لكن `.github/workflows/ci.yml` يكرر الأوامر مباشرة ولا يستدعي `make check`.

**الأثر:** يمكن أن ينجح CI مع اختلاف بسيط عن المسار الذي يستخدمه المطور محليًا، وقد تصبح صيانة القواعد في مكانين مصدر drift.

**التوصية:**

- جعل `make check` نقطة الدخول الموحدة لفحوصات backend/frontend unit.
- إبقاء Playwright و`pip-audit` كخطوات منفصلة أو أهداف واضحة.
- إضافة اختبار CI بسيط يتأكد من أن `make check` يعمل من checkout نظيف.

**معيار القبول المقترح:**

```text
make check ينجح بعد make install من checkout نظيف.
```

### P1 — تفعيل حد تغطية frontend

**الملاحظة:** `pyproject.toml` يفرض `fail_under = 80` للـbackend، لكن إعدادات Vitest لا تحتوي على coverage provider أو threshold للواجهة.

**الأثر:** خطة إعادة الهيكلة تذكر هدف تغطية frontend، لكن لا يوجد حاليًا حد آلي يمنع انخفاضها.

**التوصية:**

- إضافة `@vitest/coverage-v8`.
- إضافة إعداد coverage لـVitest.
- البدء بحد واقعي مقاس من الوضع الحالي، ثم رفعه تدريجيًا.
- نشر تقرير coverage كـCI artifact.

**ملاحظة:** لا ينبغي اختيار نسبة عشوائية قبل قياس baseline فعلي للواجهة.

### P1 — تثبيت dependencies الخاصة بالتطوير

**الملاحظة:** يوجد `backend/requirements.lock` لمتطلبات runtime، لكن `backend/requirements-dev.txt` يعتمد على نطاقات غير مثبتة مثل `pytest` و`ruff` و`pip-audit`.

**الأثر:** قد تختلف نتائج quality gate بين أجهزة المطورين أو بمرور الوقت، حتى لو كانت dependencies الخاصة بالتطبيق مثبتة.

**التوصية:** اختيار سياسة واحدة وتوثيقها:

1. lockfile منفصل لمتطلبات التطوير، أو
2. استخدام `pip-tools`/`uv` لإنتاج lockfile قابل لإعادة التوليد، أو
3. تشغيل CI دائمًا عبر lockfile مع فحص يثبت أنه محدث.

### P1 — تنظيف مسار التخزين القديم والتحقق من عدم استخدامه

**الملاحظة:** `main` نقل التخزين إلى `instance/`، لكن تشغيلات محلية سابقة خلّفت ملفات كثيرة غير متتبعة في `backend/storage/`.

**التوصية:**

- إضافة اختبار أو assertion يثبت أن `FileStorageService` لا يكتب إلى `backend/storage/` افتراضيًا.
- إضافة أمر تنظيف موثق أو migration آمن للبيانات القديمة.
- تحديد سياسة واضحة: حذف المسار القديم، أو تجاهله صراحة إذا كان مطلوبًا للتوافق، مع منع أي ملفات runtime من دخول PR بالخطأ.

### P2 — تحسين artifacts الخاصة باختبارات المتصفح

**الملاحظة:** CI يرفع `test-results/browser` عند الفشل فقط.

**التوصية:**

- رفع تقرير Playwright عند الفشل دائمًا، مع الاحتفاظ بالـtrace وconsole output.
- إضافة artifact مختصر عند النجاح في nightly أو workflow تشخيصي منفصل.
- تسجيل نسخة المتصفح وبيئة التشغيل في التقرير.

هذا مهم لأن اختبارات المتصفح كانت تحتوي تاريخيًا على حالات flaky، حتى عندما كانت suite النهائية ناجحة.

### P2 — إضافة smoke test لـWSGI والإعدادات الإنتاجية

**الملاحظة:** أضيف `backend/wsgi.py`، لكن لا يظهر في suite الحالية اختبار يستورد نقطة الدخول في وضع production ويتحقق من الإعدادات الإلزامية.

**التوصية:**

إضافة اختبار يثبت أن:

- `backend.wsgi:app` يمكن استيراده مع إعدادات production صحيحة.
- غياب `SECRET_KEY` الآمن أو إعدادات auth المطلوبة يفشل مبكرًا برسالة واضحة.
- مسارات `DATABASE_PATH` و`STORAGE_ROOT` قابلة للضبط ولا تعتمد على cwd.

### P2 — إضافة status table لخطة إعادة الهيكلة

**الملاحظة:** وثيقة `RESTRUCTURING-AND-DEVELOPMENT-PLAN-2026-09-25.md` تجمع الخطة والمعايير، لكن لا تعرض في بدايتها حالة تنفيذ كل مرحلة.

**التوصية:** إضافة جدول قصير مثل:

| المرحلة | الحالة | المرجع |
|---|---|---|
| تنظيف الجذر | مكتملة جزئيًا | PR #140 |
| quality gate | مكتملة | PR #141 |
| domain model | قيد التنفيذ/بحاجة قرار | PRs architecture |
| frontend split | لم تبدأ | — |

هذا يمنع اعتبار البنود المخطط لها ميزات منفذة فعليًا.

## 4. اقتراحات غير عاجلة

- إضافة target مثل `make coverage` لتوليد HTML report محليًا بدل تكرار خيارات pytest.
- إضافة `make test-e2e-smoke` لتشغيل مسار قصير، مع إبقاء suite الكاملة قبل الدمج.
- إضافة فحص static يمنع تسرب `backend/storage` أو absolute paths في artifacts والاستجابات.
- إضافة changelog أو release notes مختصرة مرتبطة بكل milestone بدل الاعتماد على commit history فقط.
- توثيق نسخة Python وNode المدعومة في README وربطها بإعدادات CI الحالية: Python 3.11 وNode 20.

## 5. الأولوية التنفيذية المقترحة

1. **PR A:** جعل `make check` وCI متطابقين وإضافة `make install`/رسائل واضحة للـdev dependencies.
2. **PR B:** تثبيت dev dependencies وإضافة coverage artifacts وحد frontend أولي بعد قياس baseline.
3. **PR C:** تنظيف ومراقبة `instance/storage` واختبار WSGI production smoke.
4. **PR D:** تحديث وثائق الخطة بجدول status وREADME بأوامر التشغيل الحالية.

## 6. الخلاصة

المستودع في حالة أفضل بوضوح بعد PR #141: الاختبارات الحالية ناجحة، quality tooling موجود، وCI الأخيرة ناجحة. أهم الفجوات ليست في ميزة محرر محددة، بل في **توحيد نقطة تشغيل quality gate، reproducibility لمتطلبات التطوير، وتغطية frontend، وإدارة artifacts/storage بشكل أوضح**.

لا أوصي بإضافة ميزات كبيرة جديدة قبل إغلاق هذه الفجوات، لأن ذلك سيزيد تكلفة تشخيص أي regression في مرحلة v0.9.
