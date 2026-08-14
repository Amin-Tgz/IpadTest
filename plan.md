# Pencil AI — Living Line Adventure

> برنامه محصول و معماری برای یک ماجراجویی تعاملی خطی روی iPad؛ کاربر با Apple Pencil جهان یک شخصیت زنده را کامل می‌کند.

**وضعیت سند:** Brainstorming / Pre-implementation  
**نسخه:** 0.1  
**تاریخ:** 2026-08-14

---

## 1. خلاصه تصمیم

نسخه بعدی Pencil AI از یک ابزار «تشخیص و امتیازدهی نقاشی» به یک **جهان خطی تعاملی** تبدیل می‌شود:

- پس‌زمینه آبی نفتی است.
- تمام خطوطی که کاربر می‌کشد سفید هستند.
- یک خط زمینه سفید در طول جهان وجود دارد.
- کاربر یک شخصیت خطی می‌کشد.
- AI محدوده شخصیت، اجزای بدن، صورت و jointها را در قالب JSON تشخیص می‌دهد.
- کاربر در صورت نیاز jointها را اصلاح می‌کند.
- شخصیت زنده می‌شود، اما فعلاً صدا ندارد.
- شخصیت از طریق speech bubble درخواست می‌کند.
- کاربر فقط با نقاشی جواب می‌دهد؛ متن، منو یا مکالمه صوتی ندارد.
- AI strokeهای جدید را می‌فهمد و آن‌ها را به entityهای قابل‌استفاده تبدیل می‌کند.
- موتور deterministic بازی، حرکت و نتیجه را اجرا می‌کند.

داستان MVP:

1. شخصیت زنده می‌شود.
2. می‌گوید کفش ندارد.
3. کاربر برایش کفش می‌کشد.
4. کفش‌ها به joint پا متصل می‌شوند.
5. شخصیت راه می‌رود و به برکه می‌رسد.
6. قلاب ماهیگیری درخواست می‌کند.
7. کاربر قلاب را می‌کشد.
8. قلاب به دست شخصیت متصل می‌شود.
9. شخصیت ماهی می‌گیرد.
10. یک پایان کوتاه و بامزه اجرا می‌شود.

---

## 2. چشم‌انداز محصول

### 2.1 تعریف یک‌خطی

> شخصیت مسئله دارد و مداد کاربر ابزار حل آن مسئله است.

### 2.2 تجربه‌ای که باید ایجاد شود

کاربر نباید احساس کند در حال استفاده از یک chatbot یا image generator است. تجربه باید شبیه این باشد که خطوطی که همین چند ثانیه پیش کشیده، ناگهان قوانین، نیازها و احساسات پیدا کرده‌اند.

لحظه جادویی اصلی:

> شخصیت به چیزی که کاربر روی خودش یا جهان اضافه کرده نگاه می‌کند، آن را می‌فهمد و واقعاً از آن استفاده می‌کند.

### 2.3 اصول طراحی

1. **خطوط کاربر مقدس‌اند:** AI نباید آن‌ها را با تصویر تولیدشده جایگزین کند.
2. **AI می‌فهمد؛ موتور بازی اجرا می‌کند:** مدل حرکت frame-by-frame تولید نمی‌کند.
3. **تعامل از طریق نقاشی است:** دکمه و منو تا حد ممکن کم باشد.
4. **اشتباه بخشی از داستان است:** failure مدل به واکنش شخصیت تبدیل می‌شود، نه پیام خطای خشک.
5. **محدودیت بصری هویت محصول است:** بدون texture، بدون سایه و بدون تصویرسازی generative در MVP.
6. **ابتدا قابل‌اعتماد، سپس آزاد:** داستان اول نیمه‌اسکریپت‌شده است؛ آزادی کامل بعداً اضافه می‌شود.
7. **شخصیت از حضور طراح آگاه است:** نوک Pencil، eraser و undo می‌توانند بخشی از روایت باشند.

---

## 3. محدوده MVP

### 3.1 قابلیت‌های داخل MVP

- طراحی با Apple Pencil و Pointer Events
- نگه‌داری raw strokeها، pressure و timestamp
- رنگ خط سفید روی پس‌زمینه آبی نفتی
- خط زمینه ثابت
- تشخیص یک شخصیت humanoid ساده
- خروجی JSON برای bounding box، body parts، face anchors و joints
- صفحه اصلاح jointها با drag
- idle، blink، look، walk و fishing animation
- speech bubble متنی
- Story State Machine ثابت
- تشخیص strokeهای اضافه‌شده بعد از هر درخواست
- پذیرش کفش، چکمه یا اسکیت به‌عنوان پاسخ مرحله اول
- پذیرش قلاب یا تور به‌عنوان پاسخ مرحله دوم، در صورت وجود animation متناظر
- اتصال entity خطی به bone مناسب
- حرکت camera به سمت برکه
- ذخیره session در IndexedDB
- API سازگار با OpenAI SDK، دارای `baseURL` و model قابل‌تنظیم

### 3.2 خارج از محدوده MVP

- Voice input
- TTS و lip-sync صوتی
- Image generation یا image editing
- چند شخصیت هم‌زمان
- شخصیت چهارپا یا topology کاملاً آزاد
- داستان بی‌نهایت تولیدشده توسط AI
- physics کامل و عمومی
- multiplayer
- حساب کاربری و sync ابری
- export ویدیو
- marketplace شخصیت یا داستان

---

## 4. زبان بصری

### 4.1 پالت اصلی

| نقش | رنگ | توضیح |
|---|---|---|
| Background | `#103B46` | آبی نفتی اصلی |
| Primary Ink | `#F7F5EE` | سفید گرم، کمتر خشن از سفید خالص |
| Active Ink | `#D8F6FF` | فقط هنگام کشیدن یا انتخاب موقت |
| Warning | `#FFD166` | فقط برای اصلاح joint یا confidence پایین |
| Error | `#FF7A7A` | فقط در ابزار توسعه، نه gameplay اصلی |

پالت نهایی باید روی نمایشگر iPad و در محیط روشن آزمایش شود. اگر کنتراست `#103B46` کافی نبود، دو گزینه جایگزین:

- تیره‌تر: `#0B3039`
- آبی‌تر: `#123F58`

### 4.2 قواعد خط

- تمام عناصر داستانی با خط سفید نمایش داده شوند.
- ضخامت پایه: `4px` در canvas مرجع 1024px.
- فشار قلم می‌تواند ضخامت را تقریباً از `2px` تا `8px` تغییر دهد.
- خط زمینه بهتر است کمی ضخیم‌تر یا پایدارتر از خطوط آزاد باشد.
- برای حفظ سبک مینیمال از fill، shadow و gradient استفاده نشود.
- speech bubble می‌تواند border سفید و background نیمه‌شفاف آبی تیره داشته باشد.

### 4.3 خط زمینه

- موقعیت پایه پیشنهادی: حدود `72%` ارتفاع viewport.
- خط زمینه در مختصات world ذخیره می‌شود، نه screen.
- در صحنه اول، خط تا انتهای viewport ادامه دارد.
- در مراحل بعدی می‌تواند قطع، شیب‌دار یا تبدیل به پل شود.
- baseline ثابت پشت شخصیت render می‌شود تا توهم پیوستگی حفظ شود، حتی اگر از نظر فنی path جدا باشد.

### 4.4 انیمیشن UI

- speech bubble با scale نرم از محل سر باز شود.
- متن به‌صورت کوتاه و حداکثر دو خط باشد.
- هنگام فکرکردن شخصیت سه نقطه متحرک نشان داده شود.
- هنگام تحلیل نقاشی، شخصیت به stroke جدید نگاه کند؛ spinner عمومی نمایش داده نشود.
- نوک Pencil در زمان رسم می‌تواند یک glow بسیار ضعیف داشته باشد، ولی نباید سبک خطی را بشکند.

### 4.5 تمایز هویتی

الهام از مفهوم شخصیت خطی و ارتباط آن با طراح است، اما موارد زیر باید مستقل باشند:

- طراحی و silhouette شخصیت
- نام محصول و شخصیت
- متن‌ها و شوخی‌ها
- ساختار مراحل
- پالت دقیق و motion language
- نحوه حضور Pencil و AI

---

## 5. سفر کاربر در MVP

### 5.1 ورود

1. کاربر صفحه آبی نفتی و یک خط زمینه سفید می‌بیند.
2. پیام کوتاه ظاهر می‌شود: «یک شخصیت روی خط بکش.»
3. بهتر است کنار پیام، نمونه کامل شخصیت نشان داده نشود تا خلاقیت محدود نشود.
4. راهنمای بسیار کوچک می‌گوید شخصیت فعلاً بهتر است یک سر، دو دست و دو پا داشته باشد.

### 5.2 طراحی شخصیت

1. کاربر شخصیت را با Pencil می‌کشد.
2. تمام strokeها با raw points و pressure ذخیره می‌شوند.
3. بعد از 1.2 تا 1.8 ثانیه inactivity، گزینه ظریف «زنده‌اش کن» ظاهر می‌شود.
4. کاربر آن را انتخاب می‌کند.

### 5.3 تشخیص سه‌مرحله‌ای

#### مرحله A — Bounding Box

- AI محدوده شخصیت را پیشنهاد می‌کند.
- یک کادر سفید dashed نمایش داده می‌شود.
- کاربر می‌تواند کادر را resize یا جابه‌جا کند.

#### مرحله B — Character Strokes

- سیستم strokeهای متعلق به شخصیت را highlight می‌کند.
- strokeهای خارج از شخصیت dim می‌شوند.
- کاربر می‌تواند stroke اشتباه را اضافه یا حذف کند.

#### مرحله C — Joints

- jointهای پیشنهادی به‌شکل نقطه نمایش داده می‌شوند.
- خطوط skeleton فقط در حالت setup دیده می‌شوند.
- کاربر jointها را drag می‌کند.
- در صورت confidence پایین، joint با رنگ warning نمایش داده می‌شود.

### 5.4 زنده‌شدن

1. overlayهای setup محو می‌شوند.
2. شخصیت ابتدا ثابت است.
3. چشم‌ها حرکت می‌کنند.
4. یک blink اجرا می‌شود.
5. بدن یک idle motion بسیار کم دارد.
6. شخصیت به دست‌ها و پاهایش نگاه می‌کند.
7. speech bubble باز می‌شود.

### 5.5 مرحله کفش

1. شخصیت می‌گوید: «این خط برای پای برهنه‌ام خیلی زبره…»
2. سپس: «می‌تونی برام کفش بکشی؟»
3. موتور drawing وارد `awaiting_drawing` می‌شود.
4. همه strokeهای بعدی با checkpoint جدید ثبت می‌شوند.
5. شخصیت هنگام رسم، نوک Pencil را نگاه می‌کند.
6. پس از توقف کاربر، strokeهای جدید تحلیل می‌شوند.
7. در صورت موفقیت، دو entity کفش ساخته و به foot jointها attach می‌شوند.
8. شخصیت واکنش نشان می‌دهد و راه می‌رود.

### 5.6 رسیدن به برکه

1. walk loop شروع می‌شود.
2. camera به‌آرامی به راست حرکت می‌کند.
3. برکه خطی از قبل در world وجود دارد.
4. شخصیت در لبه برکه می‌ایستد و پایین را نگاه می‌کند.
5. ماهی کوچک یک بار از آب بیرون می‌پرد.
6. شخصیت درخواست قلاب می‌کند.

### 5.7 مرحله قلاب

1. checkpoint جدید stroke ایجاد می‌شود.
2. کاربر fishing rod یا ابزار مشابه می‌کشد.
3. AI نوع شیء، handle و tip آن را تشخیص می‌دهد.
4. handle به hand bone متصل می‌شود.
5. fishing animation اجرا می‌شود.
6. ماهی بالا می‌آید.

### 5.8 پایان MVP

پایان پیشنهادی:

- ماهی در یک bubble می‌گوید: «من خیلی کوچیکم!»
- شخصیت به ماهی، سپس به کاربر نگاه می‌کند.
- متن پایان: «ادامه این خط را تو می‌کشی.»

این پایان، مسیر نسخه بعدی را باز می‌گذارد بدون اینکه MVP نیازمند انتخاب اخلاقی کامل باشد.

---

## 6. معماری سطح بالا

```text
iPad Safari
├── Drawing Engine
├── Stroke Store
├── Scene Graph
├── Character Rig Runtime
├── Animation State Machine
├── Story State Machine
├── Camera / World Renderer
└── AI Client
        │
        ▼
Express API Gateway
├── Provider Adapter
├── Structured Output Validator
├── Retry / Fallback Policy
└── API Key Protection
        │
        ▼
OpenAI-compatible Provider
└── gemini-3.7-flash or configured model
```

### 6.1 اصل جداسازی مسئولیت‌ها

| بخش | مسئولیت |
|---|---|
| Vision Model | فهم معنایی و spatial drawing |
| Story Engine | تعیین goal و transition |
| Animation Engine | اجرای حرکت‌های کنترل‌شده |
| Scene Graph | نگه‌داری entityها و روابط |
| Drawing Engine | دریافت و render strokeها |
| Provider Adapter | تفاوت providerها و APIها |

مدل AI نباید frame، transform یا physics تولید کند. خروجی مدل باید intent و metadata محدود باشد.

---

## 7. استک پیشنهادی

### 7.1 Frontend

- **Vite + TypeScript** برای modularization و type safety
- **Canvas 2D** برای نسخه اول
- **perfect-freehand** برای render طبیعی stroke
- **Pointer Events** برای Apple Pencil
- **IndexedDB** برای session محلی
- یک state machine سبک و صریح؛ در MVP می‌تواند custom باشد
- در صورت پیچیده‌شدن transitionها، استفاده از XState بررسی شود

React برای MVP ضروری نیست. رابط موجود می‌تواند به moduleهای TypeScript تقسیم شود. مهاجرت UI به React فقط در صورت افزایش جدی پیچیدگی componentها انجام شود.

### 7.2 Backend

- **Node.js + Express + TypeScript**
- OpenAI JavaScript SDK با `baseURL`
- JSON Schema + validator مستقل مانند Zod
- endpointهای کوچک و task-specific

### 7.3 مدل

پیش‌فرض:

```text
AI_MODEL=gemini-3.7-flash
```

Fallback پیشنهادی:

```text
AI_MODEL=gemini-3.6-flash
```

مدل نباید در frontend hardcode شود.

### 7.4 چرا فعلاً Python Service لازم نیست

در اولین spike، joint detection با Gemini و اصلاح دستی آزمایش می‌شود. اگر کیفیت کافی نبود، مدل pose پروژه Animated Drawings به‌عنوان یک service جدا اضافه می‌شود. واردکردن TorchServe و dependencyهای قدیمی Meta قبل از اندازه‌گیری کیفیت Gemini، پیچیدگی زودهنگام است.

---

## 8. لایه Provider مستقل از مدل

### 8.1 تنظیمات

```text
AI_BASE_URL
AI_API_KEY
AI_MODEL
AI_TIMEOUT_MS
AI_MAX_RETRIES
AI_JSON_MODE
AI_THINKING_LEVEL
```

### 8.2 interface مفهومی

```text
analyzeCharacter(input) -> CharacterAnalysis
analyzeNewDrawing(input) -> DrawingAnalysis
generateReaction(input) -> Reaction
```

در MVP می‌توان `generateReaction` را با پاسخ `analyzeNewDrawing` ادغام کرد تا call اضافی ایجاد نشود.

### 8.3 ناسازگاری providerها

OpenAI-compatible بودن همیشه به معنی یکسان‌بودن کامل نیست. adapter باید این موارد را مدیریت کند:

- image input به‌شکل data URL یا object provider-specific
- `response_format: json_schema` در صورت پشتیبانی
- fallback به `json_object`
- fallback نهایی به JSON داخل متن
- پارامترهای thinking فقط در providerهای پشتیبانی‌شده
- نام مدل provider-specific

### 8.4 اعتبارسنجی

هر خروجی AI باید:

1. parse شود.
2. با schema اعتبارسنجی شود.
3. مختصات آن clamp شود.
4. parent jointها بررسی شوند.
5. از cycle در skeleton جلوگیری شود.
6. confidence threshold اعمال شود.
7. در صورت شکست فقط یک repair request ارسال شود.
8. در صورت شکست دوم، به correction UI منتقل شود.

---

## 9. مدل داده Stroke

```json
{
  "id": "stroke_42",
  "points": [
    {
      "x": 412.4,
      "y": 295.1,
      "pressure": 0.61,
      "time": 1842
    }
  ],
  "color": "#F7F5EE",
  "baseWidth": 4,
  "tool": "pen",
  "createdAt": 1786712345,
  "worldSpace": true,
  "entityId": null
}
```

### 9.1 قواعد ذخیره

- raw points هرگز با polygon تولیدشده توسط perfect-freehand جایگزین نشوند.
- polygon یا render path می‌تواند cache شود.
- مختصات stroke در world space ذخیره شود.
- برای undo، stroke حذف فیزیکی نشود؛ state آن inactive شود.
- هر stroke پس از recognition می‌تواند به یک entity متصل شود.

### 9.2 Resampling

برای animation، strokeهای شخصیت باید به فاصله‌های تقریباً یکنواخت resample شوند. این کار:

- deformation را پایدارتر می‌کند.
- تعداد نقاط را کنترل می‌کند.
- interpolation حرکت را ساده‌تر می‌کند.

نسخه اصلی raw stroke برای ویرایش و بازسازی حفظ می‌شود.

---

## 10. ID Map داخلی

برای نگاشت مختصات AI به strokeها، یک canvas نامرئی نگه‌داری می‌شود:

- هر stroke با یک رنگ ID منحصربه‌فرد render می‌شود.
- RGB رنگ، شناسه stroke را encode می‌کند.
- کاربر این لایه را نمی‌بیند.
- وقتی AI یک point، box یا polygon می‌دهد، سیستم IDهای زیر آن ناحیه را استخراج می‌کند.

مزایا:

- مدل مجبور نیست stroke ID حدس بزند.
- انتخاب اجزای بدن دقیق‌تر می‌شود.
- entityها با stroke واقعی ساخته می‌شوند.
- undo و attachment قابل‌اعتمادتر می‌شوند.

محدودیت:

- anti-aliasing در ID Map باید خاموش یا با nearest-color handling کنترل شود.

---

## 11. Character Analysis Schema

```json
{
  "version": "1.0",
  "canvas": {
    "width": 1024,
    "height": 1024
  },
  "character": {
    "type": "humanoid_line_character",
    "boundingBox": {
      "x": 210,
      "y": 140,
      "width": 430,
      "height": 620
    },
    "pose": "front_or_three_quarter",
    "confidence": 0.88,
    "joints": [
      {
        "id": "root",
        "x": 425,
        "y": 510,
        "parent": null,
        "confidence": 0.95
      },
      {
        "id": "left_foot",
        "x": 355,
        "y": 748,
        "parent": "left_knee",
        "confidence": 0.84
      }
    ],
    "face": {
      "leftEye": {"x": 397, "y": 239},
      "rightEye": {"x": 455, "y": 239},
      "mouth": {"x": 426, "y": 286}
    },
    "partRegions": [
      {
        "part": "left_leg",
        "polygon": [[330, 480], [390, 480], [380, 760], [320, 760]],
        "confidence": 0.82
      }
    ]
  }
}
```

### 11.1 Skeleton حداقلی

برای MVP:

- root
- torso
- neck
- head
- left/right shoulder
- left/right elbow
- left/right hand
- left/right hip
- left/right knee
- left/right foot

اگر بعضی jointها موجود نبودند، سیستم باید partial rig بسازد.

### 11.2 قوانین confidence

| Confidence | رفتار |
|---|---|
| `>= 0.85` | تأیید خودکار، قابل‌ویرایش |
| `0.60–0.84` | نمایش warning ملایم |
| `< 0.60` | درخواست correction صریح |

---

## 12. ساخت Rig خطی

### 12.1 نسخه اول: Part-based Rigid Transform

هر body part مجموعه‌ای از stroke pointهاست. هر part به یک bone متصل می‌شود و حول parent joint rotate می‌شود.

مزایا:

- ساده‌تر از mesh deformation
- سریع روی iPad
- مناسب طراحی خطی
- اشکالات کوچک با سبک دست‌کشیده‌شده سازگارند

معایب:

- محل اتصال اعضا ممکن است gap ایجاد کند.
- strokeهای پیوسته بین چند عضو نیازمند split مجازی هستند.

### 12.2 Split مجازی stroke

اگر یک stroke از شانه تا دست ادامه دارد:

1. نزدیک‌ترین نقطه به elbow پیدا شود.
2. stroke در runtime به دو segment تقسیم شود.
3. segment اول به upper arm متصل شود.
4. segment دوم به forearm متصل شود.
5. فایل اصلی stroke دست‌نخورده بماند.

### 12.3 نسخه دوم: Bone-weighted Deformation

پس از اثبات MVP:

- هر نقطه می‌تواند از یک یا دو bone وزن بگیرد.
- نزدیک joint، blend نرم انجام شود.
- نقاط head و torso معمولاً rigid باقی بمانند.
- limbها می‌توانند deformation نرم داشته باشند.

### 12.4 Fallbackها

| وضعیت | نتیجه |
|---|---|
| Full rig | walk، wave، fishing |
| Partial rig | idle، blink، head look، limited walk |
| Face only | bounce، blink، bubble |
| Recognition failed | بازگشت به joint editor دستی |

هیچ‌وقت نباید کاربر فقط با پیام «تشخیص داده نشد» متوقف شود.

---

## 13. Animation System

### 13.1 Motionهای MVP

- `spawn`
- `idle`
- `blink`
- `look_at_pencil`
- `look_down`
- `talk_silent`
- `happy`
- `confused`
- `walk`
- `stop_at_pond`
- `hold_rod`
- `cast_rod`
- `pull_fish`

### 13.2 قالب Motion Clip

هر motion مجموعه‌ای از keyframeهای joint transform است:

```json
{
  "id": "walk",
  "durationMs": 720,
  "loop": true,
  "tracks": {
    "left_hip": [
      {"t": 0, "rotation": -18},
      {"t": 0.5, "rotation": 18},
      {"t": 1, "rotation": -18}
    ]
  }
}
```

### 13.3 State Machine شخصیت

```text
SETUP
  -> SPAWNING
  -> IDLE
  -> REQUESTING
  -> WATCHING_PENCIL
  -> THINKING
  -> REACTING
  -> ACTING
  -> IDLE
```

### 13.4 واکنش به Pencil

بدون AI و بر اساس Pointer Events:

- چشم‌ها به نوک Pencil نگاه کنند.
- اگر نوک نزدیک صورت است، سر کمی عقب برود.
- هنگام کشیدن روی پا، شخصیت پایین را نگاه کند.
- هنگام eraser نزدیک بدن، حالت worried اجرا شود.
- در زمان تحلیل، نگاه شخصیت روی آخرین stroke باقی بماند.

### 13.5 Performance

- static world روی offscreen canvas cache شود.
- فقط character و entity متحرک هر frame redraw شوند.
- هدف MVP: 60fps؛ حداقل قابل‌قبول: 45fps روی iPad هدف.
- AI latency هیچ‌گاه render loop را block نکند.
- تعداد pointهای rigged character محدود و resample شود.

---

## 14. Scene Graph

```json
{
  "worldId": "world_1",
  "camera": {"x": 0, "y": 0, "zoom": 1},
  "entities": [
    {
      "id": "character_1",
      "kind": "character",
      "strokeIds": ["s1", "s2", "s3"],
      "transform": {"x": 300, "y": 0, "rotation": 0},
      "state": "idle"
    },
    {
      "id": "ground_1",
      "kind": "walkable_path",
      "strokeIds": ["ground_stroke"],
      "static": true
    }
  ]
}
```

### 14.1 دسته entityها

| Kind | مثال | رفتار |
|---|---|---|
| `character` | شخصیت اصلی | rigged |
| `wearable` | کفش، کلاه | attach به bone |
| `held_tool` | قلاب، چتر | attach به hand |
| `walkable_path` | زمین، پل | path following |
| `obstacle` | دیوار، سنگ | stop/collision |
| `terrain` | برکه | scene event |
| `creature` | ماهی | animation محدود |
| `decoration` | گل، ابر | بدون physics |

---

## 15. تشخیص نقاشی جدید

### 15.1 Stroke Checkpoint

هنگام ایجاد هر درخواست:

```text
checkpointStrokeIndex = currentStrokeCount
```

تمام strokeهای بعد از checkpoint متعلق به پاسخ فعلی در نظر گرفته می‌شوند، مگر اینکه کاربر undo کند.

### 15.2 زمان ارسال برای تحلیل

شرایط پیشنهادی:

- Pencil up شده باشد.
- حداقل یک stroke جدید وجود داشته باشد.
- 1.4 ثانیه inactivity گذشته باشد.
- call دیگری در حال اجرا نباشد.

برای اشیای چندبخشی مثل دو کفش، inactivity باید امکان ادامه نقاشی را بدهد. در صورت call زودهنگام، strokeهای بعدی باید به همان attempt اضافه شوند.

### 15.3 ورودی مدل

- تصویر کامل current viewport
- تصویر cropشده فقط از strokeهای جدید
- تصویر context شامل character joints
- current goal
- accepted solution categories
- مختصات target jointها
- خلاصه world state

### 15.4 Drawing Analysis Schema

```json
{
  "goalId": "draw_shoes",
  "recognized": true,
  "matchesGoal": true,
  "confidence": 0.92,
  "objects": [
    {
      "type": "shoe",
      "category": "wearable",
      "boundingBox": {"x": 340, "y": 700, "width": 80, "height": 55},
      "attachTo": "left_foot",
      "anchor": {"x": 380, "y": 736},
      "orientationDegrees": 3,
      "affordances": ["wear", "walk"]
    }
  ],
  "interpretation": "A pair of oversized boots",
  "mappedAction": "equip_shoes",
  "reaction": {
    "emotion": "excited",
    "bubble": "وای! یکم بزرگن، ولی عاشقشونم!"
  }
}
```

### 15.5 قواعد پذیرش خلاقانه

برای goal کفش:

- shoes -> walk
- boots -> walk_heavy
- skates -> slide
- slippers -> walk_soft
- wheels attached to feet -> slide

برای goal ماهیگیری:

- fishing rod -> cast_rod
- net -> scoop_fish، فقط اگر motion موجود باشد
- spear -> در MVP با واکنش بامزه رد یا به rod نگاشت شود
- magnet -> creative alternative، در صورت تعریف ماهی فلزی

در MVP فهرست accepted solutionها محدود ولی reactionها متنوع‌اند.

---

## 16. Story Engine

### 16.1 چرا نیمه‌اسکریپت‌شده

اگر AI آزادانه هر چیزی درخواست کند، ممکن است object یا actionی بخواهد که موتور بازی توان اجرای آن را ندارد. بنابراین:

- ترتیب goalها deterministic است.
- AI متن و interpretation را طبیعی می‌کند.
- AI می‌تواند راه‌حل خلاقانه را به action موجود map کند.
- فقط actionهای ثبت‌شده اجازه اجرا دارند.

### 16.2 Quest State Machine

```text
DRAW_CHARACTER
-> CONFIRM_CHARACTER
-> SPAWN_CHARACTER
-> REQUEST_SHOES
-> VALIDATE_SHOES
-> EQUIP_SHOES
-> WALK_TO_POND
-> REQUEST_FISHING_TOOL
-> VALIDATE_FISHING_TOOL
-> EQUIP_TOOL
-> FISHING_SEQUENCE
-> ENDING
```

### 16.3 Quest Definition

```json
{
  "id": "draw_shoes",
  "request": {
    "emotion": "uncomfortable",
    "bubble": "این خط برای پای برهنه‌ام خیلی زبره…"
  },
  "acceptedCategories": ["shoe", "boot", "skate", "slipper"],
  "targetBones": ["left_foot", "right_foot"],
  "successAction": "equip_then_walk",
  "retryMode": "in_character"
}
```

### 16.4 Failure درون داستان

به‌جای error UI:

- فقط یک کفش: «پای دیگه‌ام داره حسودی می‌کنه.»
- شیء دور از پا: «فکر کنم باید یکم نزدیک‌تر پام باشه.»
- object نامشخص: «این کفشه یا سیب‌زمینی؟ یه بند هم براش می‌کشی؟»
- کلاه به‌جای کفش: «قشنگه! نگهش می‌دارم، ولی هنوز پابرهنه‌ام.»
- confidence پایین: bubble پرسشی + highlight محل موردنظر

### 16.5 محدودیت متن Bubble

- حداکثر حدود 70 کاراکتر فارسی
- حداکثر دو خط
- یک درخواست در هر bubble
- لحن کنجکاو، کمی بازیگوش، نه پرحرف
- بدون توضیح فنی

---

## 17. خط زمینه و حرکت در جهان

### 17.1 World Coordinates

- world حداقل سه برابر عرض viewport MVP باشد.
- screen point با camera transform به world point تبدیل شود.
- شخصیت همیشه روی world path حرکت کند.

### 17.2 Path Following

- ground path به polyline resample می‌شود.
- موقعیت شخصیت با distance along path تعیین می‌شود.
- زاویه بدن از tangent مسیر گرفته می‌شود.
- foot contact با offset کوچک تنظیم می‌شود.
- animation walk مستقل از سرعت camera است.

### 17.3 Camera

- شخصیت ابتدا در یک‌سوم چپ صفحه قرار می‌گیرد.
- هنگام walk، camera با easing دنبال می‌کند.
- camera نباید در زمان drawing ناخواسته حرکت کند.
- وقتی goal فعال است، camera lock می‌شود.

### 17.4 برکه

در MVP برکه یک entity از پیش‌تعریف‌شده ولی با همان style خطی است:

- outline سفید
- دو یا سه ripple line
- یک fish path ساده
- trigger zone در لبه

در نسخه بعد، خود کاربر می‌تواند برکه را بکشد و AI آن را به terrain تبدیل کند.

---

## 18. Attachment System

### 18.1 Wearable

برای هر کفش:

1. anchor AI گرفته می‌شود.
2. target foot joint مشخص می‌شود.
3. stroke points به مختصات محلی foot bone تبدیل می‌شوند.
4. هنگام حرکت پا، کفش با همان transform حرکت می‌کند.

### 18.2 Held Tool

برای fishing rod:

- `handleAnchor`
- `tipPoint`
- `targetHand`
- orientation
- scale محدود

پس از attachment، کل rod در فضای محلی hand bone ذخیره می‌شود.

### 18.3 ابزارهای بیش‌ازحد بزرگ یا کوچک

در MVP اندازه واقعی نقاشی حفظ شود. شخصیت می‌تواند واکنش بامزه نشان دهد. auto-resize فقط اگر شیء قابل‌استفاده نباشد و با رضایت ضمنی gameplay انجام شود.

اصل ترجیحی:

> عجیب‌بودن نقاشی بخشی از نتیجه است، نه خطایی که باید مخفی شود.

---

## 19. Rendering Layers

ترتیب پیشنهادی:

1. Petroleum background
2. Far world decorations
3. Ground line
4. Static world entities
5. Character back parts
6. Character body
7. Attached objects
8. Character face
9. Active user strokes
10. Pencil interaction effects
11. Speech bubble
12. Setup/debug overlays

لایه‌های static باید cache شوند. speech bubble بهتر است HTML/SVG overlay باشد تا متن فارسی و wrapping ساده‌تر شود.

---

## 20. Endpointهای پیشنهادی

### `POST /api/character/analyze`

ورودی:

- PNG یا WebP از canvas
- canvas dimensions
- optional bounding box
- character constraints

خروجی:

- CharacterAnalysis JSON

### `POST /api/drawing/analyze`

ورودی:

- full scene image
- delta crop
- goal context
- joints
- world summary

خروجی:

- DrawingAnalysis JSON

### `GET /api/config/public`

فقط capabilityهای غیرحساس:

- model display name در صورت نیاز
- feature flags
- schema version

API key و base URL واقعی نباید به iPad ارسال شوند.

---

## 21. امنیت و حریم خصوصی

- API key فقط روی server باشد.
- frontend مستقیماً provider را صدا نزند.
- اندازه image input محدود شود.
- MIME و dimensions اعتبارسنجی شوند.
- rate limit سبک روی endpointهای AI اعمال شود.
- logها شامل تصویر خام کاربر نباشند مگر debug صریح فعال باشد.
- session به‌صورت پیش‌فرض local-first باشد.
- در صورت ذخیره server-side، retention policy روشن تعریف شود.
- متن AI قبل از نمایش از نظر طول و schema محدود شود.

---

## 22. ساختار پروژه پیشنهادی

```text
src/
├── app/
│   ├── bootstrap.ts
│   ├── app-state.ts
│   └── feature-flags.ts
├── drawing/
│   ├── pointer-input.ts
│   ├── stroke-store.ts
│   ├── stroke-renderer.ts
│   ├── stroke-resampler.ts
│   └── id-map.ts
├── character/
│   ├── character-manifest.ts
│   ├── joint-editor.ts
│   ├── rig-builder.ts
│   ├── rig-runtime.ts
│   └── attachments.ts
├── animation/
│   ├── animation-controller.ts
│   ├── motion-clips.ts
│   └── motions/
├── world/
│   ├── scene-graph.ts
│   ├── camera.ts
│   ├── ground-path.ts
│   └── pond-scene.ts
├── story/
│   ├── quest-engine.ts
│   ├── quests.ts
│   └── speech-bubble.ts
├── ai/
│   ├── ai-client.ts
│   ├── schemas.ts
│   └── normalization.ts
└── storage/
    └── indexed-db.ts

server/
├── app.ts
├── routes/
│   ├── analyze-character.ts
│   └── analyze-drawing.ts
├── ai/
│   ├── provider.ts
│   ├── openai-compatible.ts
│   ├── prompts.ts
│   ├── validation.ts
│   └── retry-policy.ts
└── config.ts
```

این ساختار هدف نهایی است؛ لازم نیست در روز اول تمام فایل‌ها ایجاد شوند.

---

## 23. برنامه پیاده‌سازی مرحله‌ای

### Phase 0 — تثبیت Visual Prototype

**هدف:** بررسی اینکه سبک آبی نفتی و خط سفید روی iPad حس درست دارد.

کارها:

- اعمال پالت جدید
- اضافه‌کردن baseline
- نگه‌داری centerline و pressure
- آزمایش ضخامت خط در iPad
- speech bubble mock
- idle mock برای یک شخصیت hardcoded

خروجی قابل‌قبول:

- canvas روان باشد.
- خط سفید در محیط روشن خوانا باشد.
- bubble فارسی روی شخصیت را نپوشاند.

### Phase 1 — Character Analysis Spike

**هدف:** سنجش واقعی Gemini 3.7 Flash برای joint detection.

کارها:

- ساخت مجموعه حداقل 30 شخصیت خطی متفاوت
- ارسال تصاویر در resolution ثابت
- دریافت bounding box، face و joints در JSON
- نمایش jointها روی canvas
- ثبت correction انسانی
- اندازه‌گیری error

معیار تصمیم:

- اگر اکثر jointهای اصلی با اصلاح کم قابل‌استفاده‌اند، Gemini مسیر اصلی می‌ماند.
- اگر خطا زیاد است، Animated Drawings pose estimator به‌عنوان fallback بررسی می‌شود.

### Phase 2 — Joint Editor و Manifest

**هدف:** تبدیل خروجی احتمالی AI به rig قابل‌اعتماد.

کارها:

- draggable joints
- parent validation
- confidence display
- save/load manifest
- stroke-to-part mapping با ID Map

### Phase 3 — Rig Runtime

**هدف:** شخصیت واقعی کاربر idle و walk کند.

کارها:

- part segmentation
- virtual stroke splitting
- rigid bone transforms
- idle، blink، look و walk
- fallback برای partial rig

Gate:

> تا وقتی حداقل 8 از 10 شخصیت آزمایشی بدون deformation شدید راه نمی‌روند، وارد Story MVP نشویم.

### Phase 4 — Story Shell

**هدف:** تجربه بدون recognition شیء، با اشیای hardcoded کامل اجرا شود.

کارها:

- quest state machine
- speech bubble
- Pencil gaze
- camera
- pond scene
- کفش و rod آزمایشی hardcoded
- پایان داستان

این مرحله ثابت می‌کند animation و narrative به‌تنهایی جذاب‌اند.

### Phase 5 — Shoe Recognition

**هدف:** اولین حلقه کامل AI-to-action.

کارها:

- stroke checkpoint
- delta crop
- DrawingAnalysis schema
- shoe/boot/skate recognition
- mapping به left/right foot
- attachment
- reactionهای success/failure

### Phase 6 — Fishing Tool Recognition

**هدف:** اثبات held tool و action پیچیده‌تر.

کارها:

- تشخیص rod handle/tip
- اتصال به hand
- cast animation
- line curve
- fish sequence

### Phase 7 — Polish و Demo

کارها:

- کاهش latency ادراکی با animation
- error recovery
- session reset
- PWA fullscreen
- iPad Safari QA
- screen recording flow
- telemetry محلی یا opt-in برای eval

---

## 24. ترتیب منطقی تصمیم‌گیری فنی

این ترتیب باید رعایت شود:

1. ابتدا visual language را روی iPad تأیید کن.
2. سپس دقت joint detection را اندازه بگیر.
3. بعد correction UI بساز.
4. سپس rig یک شخصیت واقعی را اجرا کن.
5. داستان را با اشیای hardcoded کامل کن.
6. بعد recognition کفش را جایگزین hardcode کن.
7. بعد held tool را اضافه کن.
8. فقط پس از موفقیت این loop، story generation آزاد را بررسی کن.

این توالی جلوی این را می‌گیرد که هم‌زمان AI، animation، physics و داستان دیباگ شوند.

---

## 25. برنامه Eval

### 25.1 Dataset داخلی اولیه

حداقل 30 شخصیت:

- بسیار ساده و stick-like
- outline بسته
- دست‌وپا کوتاه
- دست‌وپا بلند
- کلاه یا مو
- یک چشم یا سه چشم
- بدن نامتقارن
- strokeهای متصل و جدا
- pressure مختلف

برای object recognition:

- 20 جفت کفش/چکمه/اسکیت
- 15 fishing rod
- 10 نقاشی اشتباه یا مبهم

### 25.2 معیار Character Analysis

- bounding box IoU
- mean joint distance نسبت به طول بدن
- درصد jointهای قابل‌استفاده بدون اصلاح
- تعداد dragهای موردنیاز کاربر
- latency
- parse failure rate
- cost per character

### 25.3 معیار Drawing Analysis

- object type accuracy
- matches-goal accuracy
- correct target bone
- correct anchor point
- false acceptance
- false rejection
- تعداد retryهای مدل

### 25.4 معیار تجربه

- زمان از پایان نقاشی تا واکنش شخصیت
- درصد sessionهایی که داستان کامل می‌شود
- تعداد دفعاتی که کاربر نمی‌داند چه باید بکشد
- نرخ رهاکردن در joint editor
- subjective delight: آیا کاربر واکنش یا لبخند واضح دارد؟

### 25.5 Budget Latency

هدف‌های اولیه:

| عملیات | هدف |
|---|---|
| UI response به Pencil | زیر 16ms |
| شروع reaction محلی | زیر 150ms |
| تحلیل character | ترجیحاً زیر 5s |
| تحلیل object | ترجیحاً زیر 3s |
| perceived wait | با animation پوشانده شود |

---

## 26. Test Plan

### 26.1 Unit Tests

- coordinate normalization
- schema validation
- skeleton cycle detection
- stroke checkpoint
- ID color encoding/decoding
- world/screen transform
- attachment transform
- path interpolation
- quest transitions

### 26.2 Integration Tests

- mock AI response -> joint editor
- corrected joints -> rig manifest
- shoe response -> foot attachment
- rod response -> hand attachment
- undo بعد از attachment
- retry بعد از malformed JSON
- provider بدون json_schema

### 26.3 Visual Regression

- petroleum background
- baseline position
- Persian bubble wrapping
- character render قبل و بعد rig
- attachment alignment
- camera transitions

### 26.4 Device Tests

- iPad Safari با Apple Pencil
- touch بدون Pencil
- desktop mouse برای توسعه
- orientation landscape و portrait
- PWA standalone mode
- offline reload برای session ذخیره‌شده

### 26.5 Failure Tests

- مدل timeout
- API key اشتباه
- JSON ناقص
- joint خارج canvas
- parent ناموجود
- یک پا یا یک دست
- user وسط تحلیل دوباره نقاشی کند
- undo در حال animation
- clear در وسط quest

---

## 27. ریسک‌ها و راه‌حل‌ها

### ریسک 1: Gemini jointها را دقیق تشخیص نمی‌دهد

راه‌حل:

- joint editor
- prompt با coordinate convention روشن
- ارسال تصویر دوم با grid کم‌رنگ برای تحلیل، نه نمایش کاربر
- benchmark چند مدل/provider
- fallback به Animated Drawings pose estimator

### ریسک 2: deformation خطوط عجیب می‌شود

راه‌حل:

- rigid part transform در MVP
- virtual stroke splitting
- محدودکردن شخصیت اولیه به humanoid ساده
- correction mapping
- حرکت‌های کوتاه و stylized

### ریسک 3: تشخیص object به دلیل نقاشی ساده اشتباه است

راه‌حل:

- ارسال current goal
- تحلیل delta به‌جای کل صفحه
- استفاده از proximity به target joint
- واکنش clarification درون داستان
- accepted alternatives محدود

### ریسک 4: latency جادو را خراب می‌کند

راه‌حل:

- شخصیت بلافاصله به stroke نگاه کند.
- thinking animation محلی اجرا شود.
- crop کوچک ارسال شود.
- low/medium thinking براساس task تنظیم شود.
- نتیجه cache شود.

### ریسک 5: OpenAI-compatible provider schema متفاوت دارد

راه‌حل:

- provider adapter
- capability flags
- json_schema -> json_object -> text JSON fallback
- validation و repair محدود

### ریسک 6: scope بیش‌ازحد بزرگ شود

راه‌حل:

- فقط دو request در MVP: کفش و ابزار ماهیگیری
- برکه pre-authored
- بدون voice و generation
- بدون story planner آزاد
- هر phase دارای gate قابل‌اندازه‌گیری باشد.

### ریسک 7: شباهت بیش‌ازحد به اثر الهام‌بخش

راه‌حل:

- شخصیت و silhouette مستقل
- پالت و طراحی interaction مستقل
- تمرکز بر Apple Pencil و AI recognition
- عدم استفاده از نام، شخصیت یا شوخی‌های اصلی
- تعریف یک جهان و روایت اختصاصی

---

## 28. معیار پذیرش MVP

MVP زمانی کامل است که:

- [ ] کاربر بتواند در iPad Safari یک شخصیت خطی بکشد.
- [ ] AI bounding box و joint JSON معتبر برگرداند.
- [ ] کاربر بتواند jointها را اصلاح کند.
- [ ] شخصیت واقعی کاربر blink و idle کند.
- [ ] شخصیت با خطوط خودش راه برود.
- [ ] bubble فارسی درخواست کفش نشان دهد.
- [ ] کاربر دو کفش متفاوت بکشد و سیستم آن‌ها را تشخیص دهد.
- [ ] کفش‌ها همراه پا حرکت کنند.
- [ ] camera شخصیت را تا برکه دنبال کند.
- [ ] شخصیت قلاب بخواهد.
- [ ] قلاب کاربر تشخیص داده و به دست متصل شود.
- [ ] fishing sequence بدون image generation اجرا شود.
- [ ] failure مدل به‌صورت in-character مدیریت شود.
- [ ] API key به client نرسد.
- [ ] model و base URL از env قابل‌تعویض باشند.
- [ ] تجربه کامل حداقل در 8 مورد از 10 تست انسانی بدون دخالت توسعه‌دهنده تمام شود.

---

## 29. Definition of Done برای LinkedIn Demo

ویدیوی نهایی باید بدون توضیح طولانی قابل‌فهم باشد:

1. صفحه آبی نفتی و خط سفید.
2. کاربر شخصیت را می‌کشد.
3. jointها برای یک لحظه تشخیص داده می‌شوند.
4. شخصیت blink می‌کند.
5. bubble: «من کفش ندارم!»
6. کاربر کفش می‌کشد.
7. شخصیت با همان کفش‌ها راه می‌رود.
8. به برکه می‌رسد.
9. bubble: «یک قلاب می‌خوام.»
10. کاربر قلاب می‌کشد.
11. شخصیت آن را برمی‌دارد و ماهی می‌گیرد.
12. پایان: «You don’t control this world with buttons. You draw it.»

مدت مناسب: 30 تا 45 ثانیه.

---

## 30. Backlog پس از MVP

### اولویت بالا

- کاربر ادامه خط زمینه را بکشد و شخصیت آن را دنبال کند.
- شکاف، پل و مسیرهای چندراهی
- eraser به‌عنوان gameplay mechanic
- کلاه، چتر و چراغ
- راه‌حل‌های جایگزین خلاقانه
- export ویدیو/GIF

### اولویت متوسط

- برکه و محیط کاملاً user-drawn
- شخصیت دوم
- داستان چندپایانی
- حافظه شخصیت
- نام‌گذاری شخصیت توسط دست‌خط کاربر
- emotionهای بیشتر
- library motion قابل‌افزایش

### اولویت پایین/تحقیقاتی

- story planner آزاد
- voice و TTS
- multi-character interaction
- physics عمومی برای rope و cloth
- مدل pose اختصاصی روی دیتاست strokeهای محصول
- تبدیل session به اپیزود انیمیشنی کامل

---

## 31. اولین سه آزمایش قبل از توسعه کامل

### آزمایش A — Joint JSON

یک endpoint آزمایشی که فقط تصویر را می‌گیرد و jointها را روی canvas نشان می‌دهد. هیچ animation لازم نیست.

سؤال تصمیم:

> آیا Gemini 3.7 Flash برای شخصیت‌های واقعی این پروژه به‌اندازه کافی spatially accurate است؟

### آزمایش B — Rig بدون AI

یک شخصیت hardcoded با jointهای دستی که از خطوط خودش walk می‌کند.

سؤال تصمیم:

> آیا rigid line animation از نظر بصری جذاب است یا به deformation نرم‌تر نیاز داریم؟

### آزمایش C — Shoe Loop

با jointهای دستی، کاربر کفش می‌کشد؛ AI فقط کفش را تحلیل می‌کند؛ attachment و walk اجرا می‌شود.

سؤال تصمیم:

> آیا فهمیده‌شدن و استفاده واقعی از stroke جدید همان لحظه جادویی موردنظر را ایجاد می‌کند؟

تا زمانی که این سه سؤال پاسخ مثبت نگرفته‌اند، ساخت world بزرگ‌تر یا story planner توصیه نمی‌شود.

---

## 32. تصمیم‌های قطعی فعلی

- پس‌زمینه آبی نفتی
- خط سفید
- baseline سفید
- line-native data model
- حفظ strokeهای اصلی کاربر
- OpenAI SDK با base URL قابل‌تنظیم
- `gemini-3.7-flash` به‌عنوان مدل پیش‌فرض آزمایشی
- بدون voice در MVP
- speech bubble برای ارتباط شخصیت
- story نیمه‌اسکریپت‌شده
- دو goal اصلی: کفش و ماهیگیری
- Canvas 2D در نسخه اول
- AI برای درک؛ animation engine برای اجرا

---

## 33. سؤال‌های باز که باید با prototype پاسخ داده شوند

1. آیا شخصیت باید روی baseline کشیده شود یا بعداً روی آن snap شود؟
2. آیا کاربر باید دکمه «زنده‌اش کن» بزند یا inactivity کافی است؟
3. آیا joint correction برای کاربر عادی قابل‌فهم است؟
4. آیا rigid transform ظاهر قابل‌قبولی دارد؟
5. آیا bubble فارسی راست‌چین باشد یا بر اساس زبان دستگاه؟
6. آیا شخصیت باید نام پیش‌فرض داشته باشد؟
7. آیا object analysis خودکار باشد یا یک gesture پایان نقاشی داشته باشیم؟
8. آیا کفش باید دقیقاً روی پا کشیده شود یا هر جای صفحه پذیرفته شود و شخصیت آن را بردارد؟
9. آیا برکه در viewport بعدی pre-authored باشد یا کاربر آن را بکشد؟
10. چه مقدار شباهت بصری به animationهای single-line قابل‌قبول و چه مقدار نیازمند تمایز بیشتر است؟

این سؤال‌ها نیازمند بحث انتزاعی بیشتر نیستند؛ هرکدام باید با یک prototype کوچک و مشاهده رفتار کاربر پاسخ داده شوند.

---

## 34. اقدام بعدی پیشنهادی

گام بعدی، نوشتن کل محصول نیست. فقط این vertical slice ساخته شود:

1. تم آبی نفتی و خط سفید
2. baseline
3. یک شخصیت نمونه با joint دستی
4. idle و walk خطی
5. bubble «برایم کفش بکش»
6. دریافت strokeهای جدید
7. یک call به Gemini 3.7 Flash برای تشخیص کفش
8. attachment کفش به پا
9. walk کوتاه

اگر این slice حس زنده‌بودن ایجاد کرد، joint detection خودکار و ادامه داستان روی آن ساخته می‌شود. اگر حس لازم ایجاد نشد، قبل از افزودن زیرساخت بیشتر باید animation language و تعامل Pencil اصلاح شود.

