# GREENTEC AI Film Studio: הערכת מודלים פתוחים (Open Model First)

**סטטוס:** טיוטה לאישור המפיק · **תאריך:** 2026-11-25 · **מחליף:** אין. המסמך מעדכן את `docs/STUDIO.md` ואת תוכנית הפיתוח.

המסמך עונה על דרישת הארכיטקטורה "Open Model First". הוא כולל:
- מדיניות לבחירת מודלים;
- טבלת מועמדים לכל תחום, עם רישיונות, דרישות חומרה וראיות;
- מבנה ל‑Model Registry, לבחירת מנוע ול‑GPU Resource Manager;
- Benchmark קבוע ותוכנית בדיקות מקומית על RTX PRO 5000 Blackwell (48GB VRAM, 64GB RAM).

לפי סעיף 9 בדרישה, **שום מודל לא נכנס לייצור על בסיס המסמך הזה.** המסמך קובע מה בודקים ואיך.

---

## 0. שיטה ורמות אימות

כל טענה במסמך מסומנת ברמת האימות שלה:

| סימון | משמעות |
|---|---|
| **[ראשי]** | נקרא ישירות מקובץ במאגר הרשמי: README, LICENSE, קובץ הגדרות או קוד |
| **[משני]** | מתקציר של מנוע חיפוש או מאתר צד שלישי. לא נקרא מהמקור עצמו |
| **[הערכה]** | חישוב שלנו, למשל פרמטרים כפול בתים לפרמטר. **לא** מבטיח שהמודל ירוץ בפועל |
| **[לא אומת]** | לא נמצא מקור |

**מגבלות המחקר:**

1. **Hugging Face לא היה נגיש מסביבת המחקר.** ההגבלה כללה גם את ModelScope, ‏arxiv ו‑nvidia.com. לכן כמה רישיונות משקולות שמופיעים רק בכרטיס המודל ב‑HF מסומנים [משני] או [לא אומת]. **שער האישור הראשון (סעיף 1.1) הוא קריאת כרטיס המודל ב‑HF בידי אדם,** ולא ההערכה במסמך.
2. **אף מודל לא הורץ.** בסביבת הפיתוח אין GPU. כל משפט על התאמה ל‑48GB הוא נתון של היצרן או [הערכה], עד שתהיה הרצה על המחשב של GREENTEC (סעיף 8).
3. מדדי השוואה כמו Artificial Analysis ו‑ImgEdit מובאים רק כרקע. ההחלטה תתקבל לפי ה‑Benchmark שלנו, על חומרי המקור שלנו.

---

## 1. מדיניות בחירת מודלים

### 1.1 שערים (Pass/Fail)

מודל שנכשל באחד השערים לא נכנס למצב "ניסוי":

| # | שער | איך בודקים |
|---|---|---|
| G1 | הקוד והמשקולות זמינים להורדה והרצה עצמאית | המאגר הרשמי וקובצי המשקולות |
| G2 | רישיון הקוד **ורישיון המשקולות** נקראו בנפרד, מהמקור הרשמי | אדם קורא את LICENSE ואת כרטיס המודל, ושומר עותק עם תאריך ב‑Registry |
| G3 | הרישיון מתיר שימוש מסחרי ל‑GREENTEC: הכנסה, טריטוריה (ישראל, וגם מדינות הלקוחות), סוג השימוש ותלויות | רשימת בדיקה (סעיף 3.2) |
| G4 | גם **התלויות** של הצינור מותרות: מקודדים, גלאי פנים, מודלי עיבוד מקדים | בדיקת כל רכיב שהמודל מוריד |
| G5 | הורץ בהצלחה על ה‑RTX PRO 5000, ונמדד שיא ה‑VRAM | יומן הרצה (סעיף 8) |
| G6 | המאגר מתוחזק, או שיש תוכנית תחזוקה חלופית מתועדת (fork נעול) | פעילות במאגר והצהרות היצרן |

### 1.2 ציון משוקלל, אחרי שעברו את השערים

| קריטריון | משקל |
|---|---|
| איכות ב‑Benchmark שלנו (סעיף 7) | 40% |
| יכולת מקצועית לתפקיד, כמו שמירת זהות, תנועה או עברית | 20% |
| ביצועים: זמן לשנייה מאושרת, ושיא VRAM | 15% |
| יציבות: אחוז ניסיונות חוזרים וקריסות | 10% |
| קהילה ותיעוד, תמיכה ב‑ComfyUI וב‑LoRA | 10% |
| עלות לשנייה מאושרת | 5% |

אין לבחור מודל רק משום שהוא חדש, פופולרי, חינמי או מוביל בדירוג. מודל חדש נכנס תמיד במצב "ניסוי", ולא מחליף אוטומטית מודל שכבר אושר.

---

## 2. טבלאות מועמדים

### 2.1 ניהול סוכנים ותכנון (LLM)

| מודל | גודל (סה״כ/פעיל) | רישיון משקולות | מסחרי | עברית | 48GB | המלצה |
|---|---|---|---|---|---|---|
| **Qwen3.5-35B-A3B** (שוחרר 2026-02-24) [ראשי] | 35B / 3B, MoE [ראשי: vLLM recipe] | Apache-2.0 [משני] | כן, אם יאומת | היצרן: 201 שפות. עברית לא אומתה. אין ראיה עצמאית | FP8 כ‑35GB, ‏4bit כ‑20GB [הערכה] | **מועמד**, לפי בקשת המפיק |
| **Qwen3.6-35B-A3B** (2026-04-16) [ראשי] | 35B / 3B | Apache-2.0 [משני] | כן, אם יאומת | כמו 3.5 | גרסת FP8 רשמית [משני], כ‑35GB [הערכה] | **מועמד ראשי.** הגרסה העדכנית של אותו מודל |
| Qwen3.8-27B (2026-08-14) [ראשי] | 27B dense | Apache-2.0 [משני: עיתונות] | לאמת | כמו 3.5 | FP8 כ‑27GB [הערכה] | מועמד משני. לאמת את הרישיון, כי מודל הדגל Qwen3.8 משתמש ברישיון מותאם |
| **Gemma 4 31B / 26B-A4B** (2026-04-02) | 31B dense, ‏26B/4B | Apache-2.0 [משני: בלוג Google] | כן | היצרן: מעל 140 שפות באימון. עברית לא צוינה | 31B QAT W4A16: משקולות 19.8GB [ראשי: vLLM recipe] | **מועמד ראשי** |
| **DictaLM 3.0 24B** (Dicta, ישראל) | 24B, על בסיס Mistral Small 3.1 | Apache-2.0 [משני] | לאמת בכרטיס | **מאומן על כ‑100B טוקנים בעברית.** הערכה של היצרן בלבד | יש FP8 רשמי [משני], כ‑24GB [הערכה] | **מועמד ראשי לעברית** |
| gpt-oss-20b | 21B / 3.6B | Apache-2.0 [ראשי] | כן | עברית לא נבדקה אצל היצרן | 16GB [ראשי] | בסיס השוואה |
| gpt-oss-120b | 117B / 5.1B | Apache-2.0 [ראשי] | כן | — | דורש כרטיס של 80GB [ראשי] | **נפסל:** לא נכנס ל‑48GB |
| Mistral Small 4 | 119B / 6.5B | Apache-2.0 [משני] | כן | — | כ‑60GB גם ב‑4bit [הערכה] | **נפסל:** גודל |

**פער מרכזי:** אף מודל מוביל לא נמדד באופן עצמאי בעברית. הבדיקה המקומית צריכה לכלול:
- כתיבת תסריט בעברית;
- דיאלוג לילדים;
- JSON במבנה שהמערכת דורשת;
- ביקורת של תוצר.

**תשתית הרצה:** vLLM (או llama.cpp), עם API תואם OpenAI, וקריאות כלים ופלט JSON מובנה. יש parsers רשמיים ל‑Qwen [ראשי] ול‑Gemma 4 [ראשי].

### 2.2 פיתוח ועריכת דמויות (תמונה)

| מודל | גודל | רישיון משקולות | מסחרי | ComfyUI / LoRA | VRAM | המלצה |
|---|---|---|---|---|---|---|
| **Qwen-Image-Edit-2511** (2025-12-23) [ראשי] | DiT של 20B ומקודד Qwen2.5-VL 7B [ראשי] | Apache-2.0 [ראשי: LICENSE במאגר; תגית HF ‏‑ משני] | כן | native. תבנית רשמית "Multiple Angles" (8 זוויות × 4 גבהים × 3 גדלים) [ראשי]. אימון LoRA ב‑ai-toolkit, ‏musubi-tuner ו‑DiffSynth [ראשי] | אין נתון רשמי. int8 כנראה ייכנס [הערכה] | **מועמד ראשי**. בעיות פתוחות: עיוותים במבט צד (#254), קריסה אחרי עריכות חוזרות (#274) [ראשי] |
| Qwen-Image / 2512 (T2I) | 20B | Apache-2.0 [ראשי] | כן | native, ‏LoRA | כמו למעלה | **בסיס ל‑LoRA של סגנון האיורים** |
| **FLUX.2 klein 4B / 4B Base** (2026-01-15) | 4B | Apache-2.0 [ראשי] (גרסת 9B אינה מסחרית) | כן | תבניות רשמיות. אימון LoRA (ההמלצה: Base) | כ‑8GB [ראשי] | **חלופה קלה** |
| HiDream-E1.1 | בסיס 17B, ו‑Llama 3.1 8B | MIT ותנאי Llama 3.1 [ראשי] | כן, לפי תנאי Llama | תבנית רשמית, ‏ai-toolkit | לא פורסם | חלופה. אין קלט של כמה תמונות ייחוס |
| Step1X-Edit v1p2 | — | Apache-2.0 [ראשי] | כן | צמתים של הקהילה | bf16: ‏42.5–49.8GB. ‏FP8: ‏31–34GB [ראשי] | חלופה. היצרן ממליץ על כרטיס של 80GB |
| OmniGen2 | — | Apache-2.0 במאגר. ב‑HF לא אומת | לאמת | רשמי | כ‑17GB [ראשי] | חלופה. היצרן מודה בסטייה מתמונות הייחוס |
| FLUX.3 Image Klein | 5.6B | "Kommunity": חינם עד הכנסה של 5 מיליון דולר [משני] | **לא אומת** | תבניות רשמיות | — | ממתין לקריאת הרישיון |
| FLUX.1 Kontext [dev] | 12B | FLUX.1 [dev] Non-Commercial [ראשי] | **לא**, בלי רישיון בתשלום | — | — | **נפסל** |
| FLUX.2 [dev] | 32B | FLUX [dev] Non-Commercial v2 [ראשי] | **לא** | — | ברמת H100 [ראשי] | **נפסל** |
| Qwen-Image-2.1 (2026-09-20) | DiT של 7B ומקודד VL של 8B | Qwen Research License: ‏"FOR NON-COMMERCIAL PURPOSES ONLY" [ראשי] | **לא** | — | — | **נפסל**. אפשר לבקש רישיון מסחרי מ‑Alibaba |

**הכשרה לדמויות קיימות:** בתהליך המתוכנן מאמנים LoRA לכל דמות ו‑LoRA לסגנון הספרון, מהאיורים המקוריים בלבד ובאישור בעל הזכויות. כל LoRA נרשם ב‑Registry כנכס עם מקור, זכויות וגרסה. LoRA שאומן על משקולות לא מסחריות מקבל את אותו רישיון [ראשי: רישיון FLUX dev].

### 2.3 הנפשה ויצירת וידאו

| מודל | גודל | משימה | רישיון משקולות | מסחרי בישראל | VRAM (מקור) | ComfyUI | המלצה |
|---|---|---|---|---|---|---|---|
| **Wan2.2 I2V-A14B / T2V-A14B** (2025-07-28) | 27B MoE, ‏14B פעילים | I2V/T2V, פריים ראשון ואחרון | Apache-2.0 [ראשי] | כן | ‏480p: ‏41.0GB, ‏720p: ‏59.7GB על H100 עם offload [ראשי] | native ותבניות | **מועמד ראשי** לשוטים קולנועיים |
| Wan2.2 TI2V-5B | 5B | T2V+I2V ב‑720p/24fps | Apache-2.0 [ראשי] | כן | ‏22.8GB על RTX 4090 [ראשי] | native | מועמד מהיר. מתאים ל‑Animatic |
| **Wan2.2-Animate-14B** (2025-09-19) | 14B | הנפשת דמות מסרטון הדרכה, או החלפת דמות | Apache-2.0 [ראשי] | **כן, בתנאי:** העיבוד המקדים מוריד YOLOv10 ‏(AGPL-3.0) ו‑FLUX.1-Kontext-dev (לא מסחרי, אופציונלי) [ראשי] | אין נתון לכרטיס יחיד | native ותבנית | **מועמד ראשי להנפשה.** צריך להחליף את התלויות. חיתוך הדמות עובד על אדם אחד בלבד, והתחום המוצהר הוא "humanoid" |
| **Wan-Animate-2** (2026-08-07) [ראשי] | בסדר גודל של 14B | הנפשה מקצה לקצה, בלי חילוץ פוזה | קוד Apache-2.0 [ראשי]. משקולות ב‑HF לא אומתו | לאמת | ‏"tuned for 8× A800… 480P on 2× A800" [ראשי]. **אין נתון לכרטיס יחיד** | native ותבניות | **מועמד, בסיכון זיכרון גבוה.** בהרצה חובה למדוד אם הוא נכנס בכלל |
| **LTX-2.5** (Lightricks) | 22B ומקודד Gemma-4-12B | T2V/I2V, פריים ראשון ואחרון, וידאו עם **אודיו**, דיבוב | LTX-2.x Community License [ראשי] | **כן אם הכנסת GREENTEC מתחת ל‑10 מיליון דולר בשנה** [ראשי]. ‏§20 אוסר מוצר שמתחרה ב‑Lightricks, ו‑§6 מחייב לשמור סימני מים | ‏"32GB+ VRAM" [ראשי: ComfyUI-LTXVideo] | native ותבניות | **מועמד.** צריך לאשר את גובה ההכנסה |
| HunyuanVideo-1.5 | 8.3B | T2V/I2V, הגדלה ל‑1080p | Tencent Hunyuan Community [ראשי] | בישראל כן. **אבל §5(c) אוסר להציג או להפיץ Output מחוץ לטריטוריה**, שאינה כוללת את האיחוד האירופי, בריטניה ודרום קוריאה [ראשי] | מינימום 14GB עם offload [ראשי] | native | **נפסל לייצור**, כי סרטים נמכרים ברשת גם ללקוחות באירופה. אפשר להשאיר לבדיקות פנימיות |

**סנכרון שפתיים:**

| מודל | רישיון | הערות | המלצה |
|---|---|---|---|
| InfiniteTalk / MultiTalk | Apache-2.0 [ראשי] | על בסיס Wan2.1-14B. ‏MultiTalk תומך **בשתי דמויות**. מקודד האודיו (chinese-wav2vec2) — רישיון לא אומת | **מועמד** |
| Wan2.2-S2V-14B | Apache-2.0 [ראשי] | ‏"at least 80GB VRAM" על כרטיס יחיד [ראשי] | חלופה. דורש offload |
| LTX-2.5 Dub-It | LTX-2.x | ‏"Multilingual dubbing" [ראשי] | מועמד יחד עם LTX |
| LatentSync 1.6 | קוד Apache. משקולות לא אומתו | משתמש ב‑InsightFace, שמותר ל‑"non-commercial research purposes only" [ראשי] | **נפסל** כמו שהוא |

**אף מקור לא מזכיר עברית בסנכרון שפתיים.** חייבים לבדוק את זה ב‑Benchmark.

### 2.4 דיבור וקולות בעברית (TTS)

| מודל | עברית רשמית | רישיון משקולות | מסחרי | תחזוקה | המלצה |
|---|---|---|---|---|---|
| **Chatterbox Multilingual** (Resemble AI) | **כן**, ‏"Hebrew (he)" [ראשי] | קוד MIT [ראשי]. משקולות MIT [משני] | כן | **"As of August 2026, Chatterbox is retired research and is no longer maintained"** [ראשי] | **המועמד היחיד שעבר את בדיקת הרישיון,** בכפוף לתוכנית תחזוקה (למטה) |
| OmniVoice (k2-fsa) | כן, ‏13.4 שעות אימון [ראשי] | קוד Apache. משקולות: מקורות סותרים (NC או Apache) | **לא אומת** | פעיל | ממתין לרישיון |
| XTTS-v2 | **לא** | CPML, לא מסחרי | לא | — | **נפסל** |
| MMS-TTS heb | כן | CC-BY-NC 4.0 [ראשי] | לא | — | **נפסל** |
| F5-TTS | **לא** | CC-BY-NC [ראשי] | לא | — | **נפסל** |
| phonikud-tts, ‏Robo-Shaul, ‏Kokoro-SASPEECH | כן | CC BY-NC, או נתוני SASPEECH לא מסחריים [ראשי/משני] | לא | — | **נפסל** |
| HebTTS | כן | אין קובץ LICENSE [ראשי] | לא אומת | 2024 | ממתין |

**כלי ניקוד והגייה:**

| כלי | רישיון | הערות |
|---|---|---|
| Dicta menaked | CC BY 4.0 לפי תגית HF, אבל CC BY-SA לפי המאמר [משני] | מחייב אימות |
| Phonikud / ReNikud | קוד CC BY 4.0 [ראשי]. משקולות לא אומתו | פלט עם הטעמה ושווא נע |

Chatterbox קורא ל‑`dicta_onnx` לניקוד. אם הספרייה חסרה, הוא ממשיך **בלי ניקוד** [ראשי]. על `dicta_onnx` עצמה אין רישיון.

**תוכנית תחזוקה ל‑Chatterbox (נדרשת לפי סעיף 8):**
1. Fork פנימי נעול לגרסה מסוימת, עם המשקולות שמורות אצלנו ו‑sha256.
2. סביבת Python נפרדת. הקוד נועל `torch==2.6.0` [ראשי], ותמיכה ב‑Blackwell לא אומתה.
3. מסלול חלופי: הקלטת שחקני קול אמיתיים. שיבוט קול מותר רק בהסכמה חתומה, שנרשמת ב‑`FilmRight`.

**פער מרכזי:** אין מדידה עצמאית של איכות Chatterbox בעברית. היצרן מדווח CER של 0.93% [משני]. אבל מדד מבוסס Whisper לא מודד ניקוד והטעמה, ולכן ההכרעה תהיה בהאזנה אנושית.

**סימן מים:** ‏`generate()` מטמיע תמיד סימן מים של Perth [ראשי]. צריך לתעד את זה ולהחליט אם להשאיר אותו. מומלץ להשאיר.

### 2.5 תשתית מקומית

| רכיב | רישיון / עובדה | השלכה |
|---|---|---|
| ComfyUI | GPL-3.0 [ראשי]. ‏API ללא ממשק: ‏`POST /prompt`, ‏websocket ‏`/ws`, ‏`/history`, ‏`/interrupt`, ‏`POST /free` לפריקת מודלים, ‏`--reserve-vram` [ראשי] | שימוש פנימי בלי הפצה לא מפעיל את חובות ה‑GPL [ראשי: §2]. מנוע ההרצה המרכזי |
| FFmpeg | ברירת המחדל LGPL. ‏libx264/x265 הם GPL, ו‑`--enable-nonfree` הופך את הבינארי לבלתי ניתן להפצה [ראשי] | שימוש פנימי מותר. לא להפיץ בינארי עם nonfree |
| תור משימות | Celery: ‏"Does Celery support Windows? No." [ראשי]. ‏RQ מבוסס fork, ו‑CUDA דורש spawn [ראשי]. ‏Procrastinate עובד מעל PostgreSQL בלבד [ראשי]. ‏arq במצב תחזוקה בלבד [ראשי] | **הבחירה תלויה במערכת ההפעלה של מחשב ה‑GPU** (שאלה פתוחה) |
| בקרת זיכרון ב‑PyTorch | ‏`mem_get_info`, ‏`max_memory_allocated`, ‏`set_per_process_memory_fraction`, ‏`PYTORCH_ALLOC_CONF=per_process_memory_fraction:…,throw_on_cudamalloc_oom:True` [ראשי] | בסיס ל‑GPU Resource Manager |
| RTX PRO 5000 Blackwell | ‏48GB GDDR7 ECC, ‏1,344GB/s, ‏FP4, ‏300W [משני: nvidia.com] | תמיכה ב‑FP8 ו‑FP4 תלויה בגרסאות PyTorch ו‑CUDA. נבדוק בשלב 0 |

---

## 3. Model Registry

### 3.1 שדות לכל מודל

| קבוצה | שדות |
|---|---|
| זיהוי | `key` (קבוע, למשל `wan22-i2v-a14b`), שם, גרסה, ‏commit או revision של המשקולות, ‏sha256 של כל קובץ |
| מקור | ספק, מאגר קוד רשמי, כתובת המשקולות, ‏ComfyUI/Diffusers/vLLM |
| רישוי | רישיון קוד, ורישיון משקולות **בנפרד**: שם, כתובת, **עותק מקומי של הטקסט**, תאריך קריאה ומי קרא. ספי הכנסה ומשתמשים, טריטוריה, תנאים מיוחדים (אי‑תחרות, סימן מים, ייחוס). סטטוס מסחרי: `unknown`, ‏`approved` או `rejected`, עם הנימוק |
| תלויות | רשימת המודלים והספריות שהצינור מוריד, ולכל אחד רישיון וסטטוס |
| יכולות | תגיות בשליטה: `llm.hebrew`, ‏`image.edit.identity`, ‏`image.multiangle`, ‏`video.i2v`, ‏`video.flf2v`, ‏`anim.character`, ‏`anim.two_characters`, ‏`lipsync`, ‏`tts.hebrew`, ‏`tts.clone`, ‏`lora.train` ועוד |
| חומרה | שיא VRAM ו‑RAM **שנמדדו** לכל פרופיל (רזולוציה, משך, כימות), נפח אחסון |
| פרופילי הרצה | כימות (bf16, ‏fp8, ‏int8, ‏gguf), ‏offload (מודל, בלוקים, CPU), ‏workflow קבוע של ComfyUI עם גרסה |
| ביצועים | זמן לשניית וידאו או לתמונה בכל פרופיל, ושיעור כשלים |
| איכות | ציוני ה‑Benchmark (סעיף 7) לכל מקרה בדיקה, עם קישור לתוצרים |
| עלות | עלות לשנייה מאושרת (סעיף 7.3) |
| תחזוקה | פעילות במאגר, תאריך עדכון אחרון, וסטטוס: פעיל, מואט, נטוש עם fork פנימי |
| היסטוריה | כל הרצה מתועדת: משימה, פרופיל, ‏seed, תוצאה, אושר או נדחה |
| המלצות | לאילו משימות להשתמש ולאילו לא |

### 3.2 מחזור חיים

`candidate → experimental → approved → deprecated`, ובכל שלב אפשר לעבור גם ל‑`rejected`.

- **מעבר ל‑experimental:** כל השערים G1–G4, ובדיקת רישיון שנחתמה בידי אדם.
- **מעבר ל‑approved:** גם G5–G6, ציון Benchmark, ו**אישור המפיק**.
- מודל במצב experimental רץ רק במשימות מסומנות כניסוי, ולעולם לא מחליף מודל approved אוטומטית.
- **רשימת בדיקת רישיון:** שימוש מסחרי, ספי הכנסה ומשתמשים, טריטוריה (ישראל **ומדינות הלקוחות**), בעלות על הפלט, איסור תחרות, סימן מים, ייחוס, איסור אימון על הפלט, ותלויות.

---

## 4. בחירת מנוע לפי משימה

1. **כל משימה מצהירה על היכולות שהיא צריכה.** למשל:
   - שוט הליכה: `anim.character`, ו‑`identity` נעול מספר הדמות.
   - דיאלוג: `tts.hebrew` ו‑`lipsync`.
2. **הנתב בוחר רק מבין מודלים במצב approved** שיש להם את היכולות ופרופיל הרצה מתאים. הוא מדרג לפי:
   - ציון ה‑Benchmark באותה קטגוריה;
   - שיעור הצלחה היסטורי;
   - זמן ועלות.
3. **מצב השוואה:** אותה משימה רצה ב‑2–3 מודלים או פרופילים, והמפיק או הסוכן הבודק בוחרים. התוצאה נשמרת בהיסטוריה של ה‑Registry.
4. **מפת ברירות מחדל, עד שה‑Benchmark יכריע:**

| משימה | מנוע |
|---|---|
| שימור זהות וזוויות | Qwen-Image-Edit-2511, עם LoRA דמות |
| הליכה ותנועה | Wan2.2-Animate או Wan-Animate-2 |
| שוט קולנועי | Wan2.2 I2V-A14B או LTX-2.5 |
| דיאלוג | Chatterbox, ניקוד, ואז MultiTalk או InfiniteTalk |
| הרכבה | FFmpeg |
| ניהול וטקסט | LLM מקומי מ‑2.1 |

5. **כשל חוזר:** אחרי שני ניסיונות שנכשלו מאותה סיבה, המערכת לא מנסה שוב באותו מודל. היא מציעה מודל חלופי או אנימציה מבוקרת, ומעבירה להחלטה. זה הכלל של AI‑08 שכבר קיים.

---

## 5. GPU Resource Manager

**עיקרון:** תהליך Worker אחד מחזיק את ה‑GPU, ומודל כבד אחד בלבד טעון בכל רגע.

| נושא | מנגנון |
|---|---|
| טעינה ופריקה | המודל הטעון נשאר בזיכרון בין משימות דומות. החלפת מודל מתחילה בפריקה מלאה: ‏`POST /free` ב‑ComfyUI, או סיום תהליך הבן. משימות מקובצות לפי מודל, כדי לצמצם החלפות |
| תקציב VRAM | לכל פרופיל יש שיא VRAM **שנמדד** ב‑Registry. לפני הרצה נבדק `mem_get_info()`, וגם ש‑השיא שנמדד ועוד מרווח ביטחון של 10% קטן מהזיכרון הפנוי. פרופיל בלי מדידה רץ רק בבדיקה ייעודית |
| מקביליות | עבודת GPU אחת בכל פעם. LLM מקומי לא רץ במקביל למודל וידאו כבד, אלא אם המדידה הוכיחה ששניהם נכנסים יחד. עבודות CPU (FFmpeg, ניקוד) רצות במקביל עם הגבלת ליבות |
| התאוששות מ‑OOM | ‏`per_process_memory_fraction` ו‑`throw_on_cudamalloc_oom`. בכשל: פריקה, ואז ניסיון אחד בפרופיל זול יותר (רזולוציה נמוכה יותר, fp8 או block-swap). אחר כך מודל חלופי, ואם גם זה נכשל — `BLOCKED` להחלטת המפיק. ההתאוששות רצה מחוץ לבלוק ה‑except, לפי ה‑FAQ של PyTorch |
| Checkpoints | כל שלב בצינור שומר את התוצר שלו: פריימים, מקטעים, אודיו. כך, אחרי קריסה, ממשיכים מהשלב האחרון ולא מהתחלה. סרטון ארוך מיוצר במקטעים |
| הגנה על המחשב | עד שתי עבודות בתור הפעיל, מעקב טמפרטורה ו‑VRAM דרך ‏nvidia-smi, ועצירה רכה בחריגה |
| חיבור למערכת | ה‑Worker **מושך** משימות מהתור המרכזי. כך מחשב ה‑GPU לא צריך פורט פתוח לאינטרנט. הוא מעלה תוצרים לדלי וכותב אירועים ליומן ההפקה (`FilmEvent`) |
| מעבר מבוקר לענן | רק דרך החלטת מפיק (סעיף 6) |

---

## 6. מנועי ענן מסחריים

Seedance, ‏Kling, ‏Veo, ‏Runway, ‏Claude ופתרונות סגורים אחרים:

- הם משלימים בלבד, והם **לא** מודלים פתוחים. ב‑Registry הם מסומנים `closed`.
- שליחת איורים, תסריטים או קולות לשירות כזה מחייבת שלושה אישורים: ספק מאושר לפרויקט, זכויות מתועדות ותקציב. זה המנגנון הקיים של `providers` ו‑`aiEnabled`.
- כשמודל סגור מפיק תוצאה טובה משמעותית, המערכת מציגה השוואה של אותו שוט: שני התוצרים, עלות וזמן. ההחלטה עוברת למפיק.

---

## 7. Benchmark קבוע: GREENTEC-BENCH-01

### 7.1 חומרי מקור (מספק המפיק, עם זכויות)

- איורים של שתי דמויות מקוריות, מספרון של גרינטק;
- איורים של שני מקומות;
- תסריט קצר בעברית עם דיאלוג של כ‑30 שניות.

### 7.2 מקרי בדיקה

| # | מקרה | מה נמדד |
|---|---|---|
| B1 | דמות מאיור מקורי בשש זוויות | זהות (ציון 1–5), עיוותים במבט צד |
| B2 | שמירת זהות לאורך 4 שוטים | השוואה לספר הדמות (ציון אנושי) |
| B3 | ‏12 הבעות פנים | התאמה להבעה המבוקשת, ושימור זהות |
| B4 | הליכה, עצירה והרמת חפץ | משקל, ידיים, יציבות |
| B5 | אינטראקציה בין שתי דמויות | הפרדה בין הדמויות, מגע, מבטים |
| B6 | דיבור בעברית | הבנה, ניקוד והטעמה (האזנה אנושית), סנכרון שפתיים |
| B7 | שילוב בסצנה קולנועית | תאורה, רקע עקבי, מצלמה |
| B8 | רציפות בין שוטים | לפי כללי AI‑12 |

### 7.3 מדדים לכל הרצה

- **איכות:** ציון 1–5. לפחות שני מדרגים אנושיים, והמפיק מכריע. מדדים אוטומטיים, כמו דמיון במרחב embedding, הם עזר בלבד, ובאיורי 2D מהימנותם לא הוכחה.
- **זמן רינדור, שיא VRAM ו‑RAM.**
- **מספר ניסיונות** עד תוצר מאושר.
- **עלות לשנייה מאושרת:**
  - מקומי: (זמן GPU בשעות × ‏0.3kW × מחיר קוט״ש + פחת החומרה לשעה) ÷ שניות מאושרות.
  - ענן: חשבונית ÷ שניות מאושרות.
- תנאי ההרצה קבועים: seed, גרסת workflow ונוסח הפרומפט. כך אפשר לחזור על כל הרצה.

---

## 8. תוכנית בדיקות מקומית (על ה‑RTX PRO 5000)

| שלב | תוכן | תוצר |
|---|---|---|
| **0. סביבה** | מערכת הפעלה (Linux או Windows+WSL2. **שאלה פתוחה**), דרייבר, CUDA, ו‑PyTorch שתומך ב‑Blackwell. התקנת ComfyUI ו‑vLLM. ריצת `nvidia-smi` ו‑`torch.cuda.get_device_properties` | יומן סביבה |
| **1. הרצת עשן** | לכל מועמד שעבר G1–G4: הרצה אחת קצרה בכל פרופיל. מדידת `max_memory_allocated` ו‑`nvidia-smi`, וזמן | טבלת "נכנס / לא נכנס" **מדודה**. כאן נסגר G5 |
| **2. Benchmark** | B1–B8 על המועמדים ששרדו, כולל השוואה בין מודלים | ציונים ב‑Registry, ודוח השוואה למפיק |
| **3. מבחן הדמות המונפשת** (סעיף 9 בדרישה, אחרי אישור המסמך) | איור מקורי, ממנו ספר דמות (Qwen-Image-Edit-2511 עם LoRA), ממנו שוט מונפש (Wan-Animate), ממנו משפט בעברית (Chatterbox ו‑MultiTalk), ואז הרכבה ב‑FFmpeg | שוט אמיתי של 5–10 שניות, עם כל הגרסאות והמדידות |

סדר העדיפות בהרצת העשן נקבע לפי הסיכון:
1. Wan-Animate-2: אין נתון לכרטיס יחיד.
2. Wan2.2-Animate-14B.
3. LTX-2.5.
4. Qwen-Image-Edit-2511.
5. Chatterbox.
6. ‏LLMs.

---

## 9. שילוב בקוד הקיים, בלי שכתוב

- **מה נשאר:** ‏14 הסוכנים, חוזה המשימה, מכונת המצבים, הגרסאות, התקציב, הזכויות ויומן ההפקה (`lib/studio/*`).
- **מה נוסף:**
  1. טבלאות `ModelRegistry`, ‏`ModelRun` ו‑`BenchmarkResult`.
  2. השדה החופשי `providers` מתחלף בבחירה מתוך מודלים במצב approved.
  3. שכבת ספק ל‑runner: הספק המקומי הוא vLLM עם API תואם OpenAI, ו‑Claude נשאר אפשרות ענן באישור.
  4. Python Worker על מחשב ה‑GPU (סעיף 5).
- **החלטת התשתית מהביקורת הקודמת** (ASP.NET ו‑SQL Server, מול Next.js ו‑PostgreSQL) עדיין פתוחה. התכנון כאן לא תלוי בה: ה‑Worker וה‑Registry יעבדו מול כל אחת מהן.

---

## 10. שאלות פתוחות למפיק

1. **מערכת ההפעלה במחשב ה‑GPU:** היא קובעת את התור. ‏Celery לא תומך ב‑Windows.
2. **הכנסה שנתית מעל או מתחת ל‑10 מיליון דולר:** קובע אם LTX-2.5 בחינם.
3. **האם סרטים נמכרים או מוצגים ללקוחות באיחוד האירופי ובבריטניה:** קובע את פסילת HunyuanVideo.
4. **קריאה אנושית של כרטיסי המודל ב‑HF,** עם שמירת עותק. ברשימה:
   - Qwen3.5 ו‑3.6;
   - Gemma 4;
   - DictaLM 3.0;
   - Qwen-Image-Edit-2511;
   - Wan-Animate-2;
   - Chatterbox;
   - OmniVoice;
   - FLUX.3 Klein;
   - ה‑LoRA ‏fal Multiple-Angles ו‑lightx2v;
   - chinese-wav2vec2;
   - Dicta menaked.
5. **חומרי ה‑Benchmark:** איורים ותסריט. **ושחקני קול:** האם להקליט קולות ייחוס בהסכמה חתומה?
6. **אישור המסמך:** המעבר לשלב 3 (מבחן הדמות המונפשת) מותנה בו.

---

## 11. מקורות עיקריים

כל הקישורים הבאים הם מקורות ראשיים שנקראו ישירות. מקורות משניים מסומנים בגוף הטבלאות.

- Qwen LLM: https://raw.githubusercontent.com/QwenLM/Qwen3.5/main/README.md · https://raw.githubusercontent.com/vllm-project/recipes/main/Qwen/Qwen3.5.md
- Gemma 4: https://raw.githubusercontent.com/vllm-project/recipes/main/Google/Gemma4.md · https://raw.githubusercontent.com/google-deepmind/gemma/main/LICENSE
- gpt-oss: https://raw.githubusercontent.com/openai/gpt-oss/main/README.md · https://raw.githubusercontent.com/openai/gpt-oss/main/LICENSE
- llama.cpp (ארכיטקטורות נתמכות): https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-arch.cpp
- Hebrew LLM leaderboard: https://raw.githubusercontent.com/huggingface/blog/main/leaderboard-hebrew.md
- Qwen-Image / Edit-2511: https://raw.githubusercontent.com/QwenLM/Qwen-Image/main/README.md · https://raw.githubusercontent.com/QwenLM/Qwen-Image/main/LICENSE · https://raw.githubusercontent.com/Comfy-Org/docs/main/tutorials/image/qwen/qwen-image-edit-2511.mdx
- Qwen-Image-2.1: https://raw.githubusercontent.com/QwenLM/Qwen-Image-2.1/main/LICENSE
- FLUX: https://raw.githubusercontent.com/black-forest-labs/flux/main/model_licenses/LICENSE-FLUX1-dev · https://raw.githubusercontent.com/black-forest-labs/flux2/main/README.md
- HiDream / OmniGen2 / Step1X: https://raw.githubusercontent.com/HiDream-ai/HiDream-E1/main/README.md · https://raw.githubusercontent.com/VectorSpaceLab/OmniGen2/main/README.md · https://raw.githubusercontent.com/stepfun-ai/Step1X-Edit/main/README.md
- LoRA: https://raw.githubusercontent.com/ostris/ai-toolkit/main/README.md · https://raw.githubusercontent.com/kohya-ss/musubi-tuner/main/docs/qwen_image.md · https://raw.githubusercontent.com/modelscope/DiffSynth-Studio/main/README.md
- Wan2.2: https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/README.md · https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/LICENSE.txt · https://raw.githubusercontent.com/Wan-Video/Wan2.2/main/wan/modules/animate/preprocess/UserGuider.md
- Wan-Animate-2: https://raw.githubusercontent.com/Wan-Video/Wan-Animate-2/main/README.md · https://raw.githubusercontent.com/Wan-Video/Wan-Animate-2/main/LICENSE
- LTX-2.5: https://raw.githubusercontent.com/Lightricks/LTX-2/main/LICENSE-2_x · https://raw.githubusercontent.com/Lightricks/LTX-2/main/README.md · https://raw.githubusercontent.com/Lightricks/ComfyUI-LTXVideo/master/README.md
- HunyuanVideo-1.5: https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-1.5/main/LICENSE · https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-1.5/main/README.md
- סנכרון שפתיים: https://raw.githubusercontent.com/MeiGen-AI/InfiniteTalk/main/README.md · https://raw.githubusercontent.com/MeiGen-AI/MultiTalk/main/README.md · https://raw.githubusercontent.com/bytedance/LatentSync/main/README.md · https://raw.githubusercontent.com/deepinsight/insightface/master/README.md
- רישיונות תלויות: https://raw.githubusercontent.com/THU-MIG/yolov10/main/LICENSE
- ComfyUI: https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/LICENSE · https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy/supported_models.py · https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/index.json
- TTS: https://raw.githubusercontent.com/resemble-ai/chatterbox/master/README.md · https://raw.githubusercontent.com/resemble-ai/chatterbox/master/LICENSE · https://raw.githubusercontent.com/k2-fsa/OmniVoice/main/docs/languages.md · https://raw.githubusercontent.com/SWivid/F5-TTS/main/README.md · https://raw.githubusercontent.com/facebookresearch/fairseq/main/examples/mms/README.md
- ניקוד: https://raw.githubusercontent.com/thewh1teagle/phonikud/main/LICENSE · https://raw.githubusercontent.com/renikud/renikud/main/README.md
- FFmpeg: https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/LICENSE.md
- תורים ו‑PyTorch: https://raw.githubusercontent.com/celery/celery/main/docs/faq.rst · https://raw.githubusercontent.com/procrastinate-org/procrastinate/main/README.md · https://raw.githubusercontent.com/pytorch/pytorch/main/docs/source/notes/cuda.md
