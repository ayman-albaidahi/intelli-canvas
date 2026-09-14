# IntelliCanvas — خطة التطوير القادمة للوكيل

**الإصدار المرجعي:** `main` عند commit `95854ab`  
**تاريخ الخطة:** 2026-09-14  
**الهدف:** نقل IntelliCanvas من نموذج أولي Full-Stack ناجح إلى نسخة مستقرة قابلة للاختبار والعرض، مع الحفاظ على الفصل الواضح بين المعاينة المحلية والنتيجة المعالجة في Python.

---

## 1. تعليمات عامة للوكيل

أنت تعمل على مستودع `ayman-albaidahi/intelli-canvas`. يجب اعتبار `main` عند commit `95854ab` نقطة البداية الحالية، وعدم افتراض أن الوثائق التاريخية تعكس حالة التشغيل الحالية.

التزم بالقواعد التالية طوال التنفيذ:

1. استخدم **HTML وCSS وJavaScript Vanilla** في الواجهة الحالية، ولا تستبدلها بإطار عمل جديد.
2. استخدم **Flask وPillow وOpenCV وNumPy** في الـBackend حسب الحاجة.
3. لا تنقل معالجة البكسلات إلى JavaScript. JavaScript مسؤول عن المعاينة والتفاعل، بينما Python مسؤول عن النتيجة المعتمدة.
4. حافظ على التمييز البصري بين:
   - **Local Preview:** معاينة سريعة غير محفوظة تنتج من Canvas.
   - **Committed Backend Result:** نتيجة تم تنفيذها في Python وتسجيلها في التاريخ.
5. لا تكسر عقود API الحالية. أي تعديل على response shape يجب أن يكون متوافقاً للخلف أو موثقاً بوضوح.
6. نفّذ كل مرحلة في **فرع مستقل** وأنشئ PR منفصلاً.
7. لا تخلط إصلاحات UI الكبيرة مع تغييرات الـAPI في PR واحد إلا إذا كانت ضرورية للتكامل.
8. بعد كل تغيير شغّل الاختبارات المناسبة، ثم حدّث `docs/current/system-status.md` إذا تغيرت حالة تشغيل أو API أو dependency.
9. لا تعتبر نجاح اختبار Python دليلاً على نجاح الواجهة. أضف اختباراً Browser-level عندما تكون المشكلة متعلقة بالـDOM أو Canvas أو التفاعل.
10. لا تحذف ملفات تاريخية إلا بعد التأكد من عدم وجود مراجع تشغيلية لها، ثم اذكر الحذف في تقرير PR.

---

## 2. الحالة الحالية التي يجب البناء عليها

### ما هو منفذ

| المجال | الحالة الحالية |
|---|---|
| Active frontend | `frontend/editor-v2/` |
| Backend | Flask مع خدمات منفصلة ومسارات REST |
| Storage | SQLite للبيانات الوصفية، ونظام ملفات للصور |
| Image processing | Pillow + OpenCV + NumPy |
| Core transformations | Upload, crop, resize, rotate, flip, export |
| Adjustments | Brightness, contrast, saturation, blur, sharpen, grayscale, negative |
| v0.4 filters | Histogram, Sobel, Laplacian, median, morphology, gamma, threshold |
| Layers | Persistence, assets, ordering/visibility data, composition during export |
| Background | Mask preview, remove, replace, background library |
| History | Undo, redo, goto, clear and operation records |
| Analysis | Brightness, contrast, dimensions, findings and suggestions foundation |
| Automated backend tests | 203 passed |
| Frontend tests | 3 Vitest tests passed |

### ما هو غير منفذ أو يحتاج تقوية

| المجال | الحالة |
|---|---|
| API capability discovery | غير موجود |
| Processing Pipeline | Stub يعيد `501 Not Implemented` |
| Browser smoke testing | غير موجود بشكل كافٍ |
| Frontend unit coverage | محدود جداً |
| Revision/stale-request protection | غير مكتمل |
| Production secret enforcement | يوجد fallback development secret |
| Ownership/authentication | غير موجود للاستخدام متعدد المستخدمين |
| Documentation consistency | بعض الوثائق القديمة تذكر سلوك `501` لم يعد صحيحاً |

---

# 3. ترتيب التنفيذ الإلزامي

## المرحلة 0 — تثبيت خط الأساس والتوثيق

### الهدف
إنشاء خط أساس موثوق قبل إضافة ميزات جديدة.

### المهام

1. أنشئ فرعاً باسم:
   `chore/stabilize-baseline`
2. حدّث `docs/current/system-status.md` ليشير إلى commit الفعلي الذي ستبني عليه.
3. راجع الوثائق التالية:
   - `docs/backend-frontend-integration.md`
   - `docs/backend-grayscale-processing.md`
   - `docs/current/v0.4-image-processing-review.md`
4. ميّز الوثائق التاريخية بعبارة واضحة مثل:
   > This document records a historical implementation stage. For current runtime behavior, see `docs/current/system-status.md`.
5. صحّح أي جملة تقول إن عمليات brightness أو contrast أو saturation أو v0.4 filters ما تزال `501` إذا كانت لا تنطبق على `main` الحالي.
6. لا تغير سلوك الكود في هذا PR إلا إذا كان التصحيح ضرورياً لتوثيق endpoint موجود.

### معايير القبول

- لا توجد وثيقة إرشادية حالية تصف endpoints منفذة على أنها غير منفذة.
- `system-status.md` يذكر commit المرجعي الصحيح.
- `pytest -q` ينجح.
- `ruff check backend tests` ينجح.
- `npm run test:frontend -- --run` ينجح.
- `git diff --check` ينجح.

---

## المرحلة 1 — اكتشاف قدرات الـBackend

### اسم الفرع
`feat/api-capabilities-discovery`

### الهدف
منع ظهور أدوات في الواجهة لا يدعمها الـBackend الحالي.

### Backend: أضف `GET /api/capabilities`

المسار المقترح:

```http
GET /api/capabilities
```

الاستجابة المقترحة:

```json
{
  "success": true,
  "api_version": "0.8",
  "features": {
    "upload": true,
    "transform": true,
    "adjustments": true,
    "filters": true,
    "layers": true,
    "background": true,
    "analysis": true,
    "suggestions": true,
    "pipeline": false,
    "comparison": true
  },
  "operations": {
    "brightness": {"enabled": true, "min": 0, "max": 200, "neutral": 100},
    "contrast": {"enabled": true, "min": 0, "max": 200, "neutral": 100},
    "saturation": {"enabled": true, "min": 0, "max": 200, "neutral": 100},
    "blur": {"enabled": true, "min": 0, "max": 20, "neutral": 0},
    "sharpen": {"enabled": true, "min": 0, "max": 5, "neutral": 0},
    "gamma": {"enabled": true, "min": 0.1, "max": 5.0, "neutral": 1.0},
    "threshold": {"enabled": true, "min": 0, "max": 255},
    "sobel": {"enabled": true, "kernels": [1, 3, 5, 7]},
    "laplacian": {"enabled": true},
    "median-filter": {"enabled": true, "kernels": [1, 3, 5, 7, 9, 11, 13, 15]},
    "morphology": {"enabled": true, "operations": ["erode", "dilate", "open", "close"]}
  },
  "limits": {
    "max_file_size": 10485760,
    "max_image_side": 10000,
    "max_image_pixels": 25000000
  }
}
```

### Frontend

1. أضف `ApiClient.capabilities()`.
2. نفّذ تحميل القدرات عند بدء التطبيق.
3. أضف حالة واضحة للتطبيق:
   - `Backend connected`
   - `Backend unavailable`
   - `Feature unavailable`
4. عطّل أدوات العمليات التي لا تظهر في response.
5. لا تجعل تعطيل الأداة يمنع فتح الواجهة بالكامل.
6. عند فشل capabilities، اسمح فقط بالمعاينة المحلية، وأظهر رسالة تفيد أن الحفظ المعتمد في Python غير متاح.
7. استخدم البيانات القادمة من capabilities لضبط ranges في sliders بدلاً من تكرار القيم في أكثر من ملف متى كان ذلك مناسباً.

### الاختبارات

- اختبار Flask للـendpoint وشكل response.
- اختبار أن pipeline يظهر `false` حالياً.
- اختبار JavaScript لتحليل capabilities وتعطيل الأدوات.
- اختبار حالة فشل الشبكة.
- اختبار أن الواجهة لا تنهار إذا غاب حقل اختياري من response.

### معايير القبول

- الواجهة تعرف قدرات الخادم قبل تمكين أدوات المعالجة.
- لا يظهر خطأ 404 للمستخدم بسبب عملية غير مدعومة؛ تظهر رسالة واضحة بدلاً منه.
- جميع الاختبارات السابقة تبقى ناجحة.

---

## المرحلة 2 — تأسيس Browser Smoke Test

### اسم الفرع
`test/browser-editor-smoke`

### الهدف
إثبات أن المسار الفعلي في المتصفح يعمل، وليس فقط أن الـAPI يمر بالاختبارات.

### السيناريو الإلزامي

نفّذ اختباراً باستخدام Playwright أو أداة Browser مناسبة متاحة في بيئة المشروع:

1. تشغيل Flask من root.
2. فتح `/editor-v2/`.
3. تحميل صورة اختبار صغيرة.
4. التأكد من اختفاء empty state وظهور الصورة.
5. تحريك Brightness أو Contrast.
6. التأكد من أن النص يوضح وجود تغييرات غير معتمدة.
7. الضغط على **Apply adjustments**.
8. انتظار رسالة نجاح.
9. التأكد من تغير content URL أو revision metadata.
10. التأكد من تسجيل العملية في history.
11. تنفيذ Undo ثم Redo.
12. فتح Compare والتأكد من ظهور split-screen.
13. تصدير الصورة والتأكد من تنزيل response صالح.

### قواعد الاختبار

- لا تعتمد على `sleep` الثابت إلا عند الضرورة.
- استخدم selectors مستقرة مثل `data-action` و`data-adjustment`.
- احفظ screenshot عند الفشل.
- استخدم fixture صورة صغيرة لا تتجاوز حدود المشروع.

### معايير القبول

- الاختبار ينجح على checkout نظيف.
- يفشل الاختبار برسالة واضحة إذا توقف الـBackend.
- لا توجد أخطاء JavaScript غير معالجة في Console أثناء السيناريو.

---

## المرحلة 3 — توحيد نموذج الإصدار Revision Model

### اسم الفرع
`feat/image-revision-contract`

### الهدف
منع أن تستبدل استجابة قديمة من الشبكة نتيجة أحدث.

### Backend

1. أضف `revision` أو `revision_id` إلى image session.
2. كل عملية mutating تزيد revision بشكل ذري.
3. كل response للصورة يتضمن:

```json
{
  "image_id": "...",
  "revision": 7,
  "operation": "Brightness 120%",
  "width": 1200,
  "height": 800
}
```

4. اسمح للطلب بإرسال `source_revision` اختيارياً.
5. إذا كانت `source_revision` أقدم من الحالية، أعد خطأ واضحاً:

```json
{
  "success": false,
  "error": {
    "code": "STALE_IMAGE_REVISION",
    "message": "The image changed before this operation completed."
  }
}
```

6. لا تكسر العملاء الذين لا يرسلون `source_revision` في هذه المرحلة.

### Frontend

1. خزّن آخر revision معروف.
2. أرسل revision مع العمليات المتغيرة.
3. لا تطبق response إذا كان revision أقل من الحالة الحالية.
4. اعرض للمستخدم رسالة لإعادة التحميل أو إعادة المحاولة.
5. حدث cache-busting ليدعم revision، مع إبقاء timestamp كحل احتياطي.

### الاختبارات

- طلبان متزامنان على نفس revision.
- response قديم يصل بعد response جديد.
- undo/redo مع revision.
- history لا يسجل نتيجة stale.

---

## المرحلة 4 — تنفيذ Processing Pipeline

### اسم الفرع
`feat/processing-pipeline`

### الهدف
تحويل مجموعة العمليات إلى pipeline قابلة للترتيب والتعديل والتعطيل، مع تسجيلها كعملية واحدة قابلة لإعادة البناء.

### Contract مقترح

```http
POST /api/pipeline
Content-Type: application/json
```

```json
{
  "image_id": "session-id",
  "source_revision": 7,
  "nodes": [
    {
      "id": "node-1",
      "operation": "brightness",
      "enabled": true,
      "params": {"value": 120}
    },
    {
      "id": "node-2",
      "operation": "contrast",
      "enabled": false,
      "params": {"value": 130}
    },
    {
      "id": "node-3",
      "operation": "gamma",
      "enabled": true,
      "params": {"value": 1.2}
    }
  ]
}
```

### العمليات المدعومة مبدئياً

- brightness
- contrast
- saturation
- blur
- sharpen
- grayscale
- negative
- gamma
- threshold
- sobel
- laplacian
- median-filter
- morphology

Histogram لا يدخل في pipeline لأنه read-only.

### قواعد التنفيذ

1. حافظ على ترتيب nodes.
2. تجاهل node إذا كان `enabled: false`.
3. تحقق من operation قبل التنفيذ.
4. تحقق من params باستخدام نفس حدود endpoints الحالية.
5. لا تسمح بتكرار غير محدود أو pipeline ضخمة؛ ضع حداً أولياً مثل 50 node.
6. نفذ pipeline على source image واحد داخل service.
7. اكتب ملف نتيجة واحداً.
8. سجل pipeline كاملة في history metadata.
9. أعد nodes المنفذة وrevision الجديد.
10. اجعل `GET /api/pipeline` يعيد contract أو schema مفيداً بدلاً من 501 إذا كان ذلك متوافقاً مع التصميم.

### Frontend UI

أضف panel مستقل باسم **Processing Pipeline**، ولا تضعه داخل Adjustments فقط.

يجب أن يحتوي على:

- قائمة nodes.
- زر Add operation.
- اختيار operation.
- حقول parameters حسب العملية.
- Toggle enabled/disabled.
- Drag-and-drop أو أزرار Move up/Move down.
- Duplicate node.
- Delete node.
- Reset pipeline.
- Preview locally.
- Apply pipeline in Python.

### معايير القبول

- يمكن إضافة عمليتين وترتيبهما.
- يمكن تعطيل عملية دون حذفها.
- النتيجة تتغير حسب الترتيب.
- العملية المعتمدة تسجل كـhistory entry واحدة واضحة.
- pipeline غير الصالحة تعيد error contract موحداً.
- endpoint القديم لكل عملية يظل يعمل.

---

## المرحلة 5 — اختبار تكامل الأدوات الحالية في المتصفح

### اسم الفرع
`test/browser-core-editor-flows`

### السيناريوهات المطلوبة

أنشئ Browser tests مستقلة للآتي:

1. **Adjustments**: sliders → local preview → Apply Python → result.
2. **Filters**: histogram read-only لا يغير history، وSobel/Gamma/Threshold تغير الصورة.
3. **Comparison**: original/edited split مع handle.
4. **Layers**: إنشاء layer، تغيير visibility/order/opacity، حفظ، إعادة تحميل.
5. **Background**: color mask preview ثم remove أو replace.
6. **Analysis**: run analysis ثم preview/apply/dismiss suggestion.
7. **Export**: export format صالح وتنزيل blob.
8. **Error recovery**: session missing، backend offline، invalid operation.

### معايير القبول

- كل workflow له test واضح.
- failures تحفظ screenshot وConsole log.
- tests لا تعتمد على بيانات حساب خارجي.
- tests تعمل بfixture image ثابتة.

---

## المرحلة 6 — تقوية الواجهة وتجربة الاستخدام

### اسم الفرع
`feat/editor-ux-hardening`

### الهدف
تحسين UX بعد إثبات التكامل، وليس قبل ذلك.

### التحسينات

1. أظهر دائماً حالة الصورة:
   - Local preview
   - Unsaved changes
   - Processing in Python
   - Committed result
   - Backend unavailable
2. امنع تكرار الضغط أثناء المعالجة.
3. حافظ على قيمة sliders عند نجاح العملية أو وضح سبب reset.
4. أضف progress indicator للعمليات الثقيلة.
5. اجعل focus ينتقل إلى رسالة النتيجة عند انتهاء العملية.
6. أضف `aria-live` للحالات والتوستات.
7. تأكد من RTL للعربية وLTR للإنجليزية.
8. اختبر Light Rose وDark mode في كل panel.
9. اجعل المقارنة قابلة للاستخدام بالكيبورد، وليس بالماوس فقط.
10. لا تغير مساحة canvas المركزية بشكل يؤدي إلى ظهور الشعار أو panels فوق الصورة.
11. اجعل empty state واضحاً ولا يمنع زر Choose image من فتح file picker.
12. أضف اختصارات لوحة مفاتيح موثقة، مع عدم اعتراض الكتابة داخل inputs.

### معايير القبول

- لا توجد حالات صامتة أثناء network request.
- الأدوات غير المتاحة لا تبدو كأنها تعمل.
- لا يحدث layout shift كبير عند ظهور الشعار أو فتح panel.
- اختبارات RTL وDark mode الأساسية تمر بصرياً أو عبر browser assertions.

---

## المرحلة 7 — توسيع اختبارات JavaScript

### اسم الفرع
`test/frontend-state-coverage`

### الاختبارات المطلوبة

أضف Vitest tests للـmodules ذات الحالة:

- `api-client.js`
- `adjustments-manager.js`
- `filters-manager.js`
- `analysis-manager.js`
- comparison state
- canvas preview state
- error mapping

اختبر على الأقل:

1. neutral values لا ترسل Apply.
2. changed values تنتج payload صحيحاً.
3. reset يعيد الحالة المحايدة.
4. busy يمنع طلبات مزدوجة.
5. response القديم لا يستبدل response الأحدث.
6. API error code يتحول إلى رسالة مفهومة.
7. histogram لا يطلق history operation.
8. Apply يطلق `ic-operation` مرة واحدة.

---

## المرحلة 8 — Security وProduction Hardening

### اسم الفرع
`fix/production-security-hardening`

### المهام

1. عند `FLASK_ENV=production` أو config production:
   - ارفض fallback `SECRET_KEY`.
   - ارفض debug mode.
2. تحقق من الصور المرفوعة عبر Pillow، وليس MIME label فقط.
3. طبّق width/height/pixel limits على:
   - primary uploads
   - background uploads
   - layer assets
4. أعد ترميز الصور المقبولة إلى صيغة آمنة.
5. امنع أسماء الملفات ومسارات traversal.
6. ضع retention أو cleanup للملفات القديمة.
7. أضف quota لكل session أو project.
8. راجع CORS وsecurity headers.
9. راجع حجم request body قبل فك الملفات.
10. أضف tests للصور المزيفة والملفات الكبيرة والـmalformed payloads.

### معايير القبول

- production startup يفشل إذا غاب secret.
- كل image entry point يستخدم validation موحدة.
- لا يمكن للعميل تخزين ملف خارج storage directory.
- الاختبارات الأمنية الحالية والجديدة ناجحة.

---

## المرحلة 9 — Ownership والاستعداد للنشر

### اسم الفرع
`feat/project-ownership-boundary`

### الهدف
تحويل التخزين الحالي من نموذج local single-user إلى أساس آمن لنموذج project/user.

### المهام

1. أضف owner/project identifier إلى image sessions.
2. تحقق من ownership في كل endpoint:
   - image content
   - processing
   - history
   - layers
   - background assets
   - export
   - analysis
3. لا تعتمد على `image_id` وحده كإذن وصول.
4. أضف migration واضحة لقاعدة البيانات.
5. أضف tests لعزل مشروع عن مشروع آخر.
6. لا تضف login UI قبل تثبيت قرار authentication architecture.

---

# 4. تعريف الإنجاز النهائي Definition of Done

لا تعتبر IntelliCanvas جاهزاً للعرض النهائي إلا عند تحقق الشروط التالية:

## Backend

- جميع endpoints الحالية موثقة.
- `GET /api/capabilities` يعمل.
- Processing Pipeline يعمل مع validation وhistory.
- revision protection موجودة.
- production configuration لا تستخدم secret fallback.
- uploads وlayer assets تمر عبر validation موحدة.

## Frontend

- local preview والنتيجة المعتمدة واضحتان دائماً.
- controls تتزامن مع capabilities.
- Compare يعمل بعد تطبيق نتيجة backend.
- Layers وBackground وAnalysis موصولة فعلياً في المتصفح.
- رسائل الأخطاء قابلة للفهم.
- Arabic RTL وEnglish LTR يعملان.
- Light Rose وDark modes لا تكسر layout.

## Testing

- Python tests تمر.
- Ruff يمر.
- Vitest يمر.
- JavaScript syntax checks تمر.
- Browser smoke suite تمر.
- CI تثبت كل ذلك على checkout نظيف.

## Documentation

- `docs/current/system-status.md` محدث.
- الوثائق التاريخية موسومة بوضوح.
- كل PR يحتوي على:
  - الهدف
  - الملفات المتغيرة
  - API contract إن وجد
  - الاختبارات
  - طريقة التجربة اليدوية
  - known limitations

---

# 5. النص الجاهز لإعطائه للوكيل

انسخ النص التالي كما هو للوكيل:

> أنت تعمل على مستودع `ayman-albaidahi/intelli-canvas`. ابدأ من `main` عند commit `95854ab`. راجع أولاً `docs/repository-audit-2026-09-14.md` وهذه الخطة كاملة قبل تعديل أي كود.
>
> لا تبدأ بتنفيذ Processing Pipeline مباشرة. نفّذ المراحل بالترتيب التالي:
>
> 1. تثبيت baseline وتصحيح الوثائق القديمة.
> 2. إضافة `GET /api/capabilities` وربطه بالواجهة.
> 3. إضافة Browser Smoke Test لمسار upload → local preview → Python Apply → undo/redo.
> 4. إضافة revision IDs وحماية stale requests.
> 5. تنفيذ Processing Pipeline بعمليات مرتبة وقابلة للتعطيل والتعديل.
> 6. إضافة Browser tests لبقية الأدوات.
> 7. تحسين UX وحالات backend/local preview.
> 8. توسيع Vitest coverage.
> 9. تنفيذ production security hardening.
> 10. تنفيذ ownership boundary إذا كان المشروع متجهاً للنشر متعدد المستخدمين.
>
> لكل مرحلة:
>
> - أنشئ فرعاً مستقلاً.
> - افحص الكود الحالي قبل التعديل.
> - لا تكسر API الحالي.
> - أضف الاختبارات قبل إعلان اكتمال المرحلة.
> - شغّل `pytest -q` و`ruff check backend tests` و`npm run test:frontend -- --run`، وأضف Browser test عندما تكون المرحلة متعلقة بالواجهة.
> - حدّث `docs/current/system-status.md` إذا تغيرت capabilities أو dependencies أو API.
> - أنشئ PR واضحاً مع خطوات التجربة اليدوية والقيود المعروفة.
>
> لا تعتبر أي عملية ناجحة لمجرد أن Canvas تغير محلياً. يجب أن يكون واضحاً هل النتيجة Local Preview أم Committed Backend Result. يجب أن تتم عمليات البكسلات المعتمدة في Python.
>
> ابدأ الآن بالمرحلة الأولى فقط، ثم اعرض ملخصاً يحتوي على الملفات المتغيرة، الاختبارات التي نجحت، وكيفية تجربة النتيجة قبل الانتقال إلى المرحلة التالية.

---

# 6. الترتيب المقترح للـPRs

| PR | الفرع | النطاق |
|---:|---|---|
| 1 | `chore/stabilize-baseline` | توثيق baseline وتصحيح الوثائق التاريخية |
| 2 | `feat/api-capabilities-discovery` | capabilities endpoint وربط الواجهة |
| 3 | `test/browser-editor-smoke` | أول Browser smoke test للمسار الأساسي |
| 4 | `feat/image-revision-contract` | revision IDs وحماية stale requests |
| 5 | `feat/processing-pipeline` | pipeline كاملة مع backend وUI |
| 6 | `test/browser-core-editor-flows` | اختبار الأدوات الحالية في المتصفح |
| 7 | `feat/editor-ux-hardening` | حالات UI وRTL/Dark/Compare/accessibility |
| 8 | `test/frontend-state-coverage` | توسيع Vitest |
| 9 | `fix/production-security-hardening` | secrets والتحقق والحدود والتنظيف |
| 10 | `feat/project-ownership-boundary` | ownership والاستعداد للنشر متعدد المستخدمين |

**الأولوية الفعلية الآن:** PR رقم 1 ثم PR رقم 2. لا تبدأ بإضافة أدوات جديدة قبل إتمامهما، لأن الهدف الأول هو منع التشتت ومشكلات اختلاف الواجهة عن الـBackend.
