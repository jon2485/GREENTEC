# studio-bench: מדידות אמיתיות על מחשב ה‑GPU

כלים קטנים שמבוססים על Python בלבד (ספרייה סטנדרטית, בלי חבילות נוספות). **הכלים עצמם** לא מורידים ולא מתקינים דבר, ומדברים רק עם ComfyUI במחשב הזה, בלי Proxy ובלי הפניות.

**שימו לב: ComfyUI עצמו, ובעיקר custom nodes, עשויים להוריד משקולות בהרצה הראשונה.** לדוגמה, ‏comfyui_controlnet_aux מוריד את DWPose. כדי למנוע הורדות לא מאושרות:
- מריצים את ComfyUI עם `HF_HUB_OFFLINE=1`;
- מניחים את קובצי המודלים ידנית, רק אחרי אישור;
- לא מתקינים ComfyUI-Manager.

הכלים מתעדים כל ניסיון של מודל על ה‑RTX PRO 5000: זמן, שיא VRAM ו‑RAM, כשל או הצלחה, ותוצרים עם sha256. אחר כך הם מפיקים דוח השוואה.

**שום דבר כאן לא מוכיח איכות בלי הרצה אמיתית וצפייה אנושית.** התוכנית המלאה נמצאת ב‑`docs/OPEN_MODEL_EVALUATION.md`.

| קובץ | מה הוא עושה |
|---|---|
| `env_check.py` | **קובץ עצמאי.** דוח סביבה לקריאה בלבד. שם המשתמש, שם המחשב ותיקיית הבית מוסתרים: מערכת הפעלה, דרייבר, CUDA, ‏PyTorch ותמיכה ב‑Blackwell, בדיקת bf16 קצרה, דיסק, FFmpeg (האם נבנה עם GPL או nonfree), ‏ComfyUI |
| `measure.py` | מריץ את הפקודה שהקלדתם, דוגם ‏VRAM ו‑RAM כל חצי שנייה, ורושם שורה ב‑`results/runs.jsonl`. **הרישום קורה גם בכשל, בחריגת זמן ובעצירה עם Ctrl+C.** בחריגת זמן נעצרים גם כל התהליכים שהפקודה הפעילה. הנתיבים נשמרים יחסית לתיקייה, ובלי פרטים מזהים. הכשלים מסווגים: ‏oom, ‏cuda_arch, ‏missing_node, ‏missing_model, ‏comfy_unreachable, ‏nan, ‏missing_program, ‏timeout, ‏interrupted |
| `comfy_run.py` | מריץ workflow של ComfyUI בפורמט API, **רק מול 127.0.0.1**. מעלה קלטים ל‑`input/studio-bench/` בלי לדרוס קבצים קיימים, ומפנים אליהם עם `@1`. שומר את התוצרים ואת הגרף המדויק שרץ. בחריגת זמן או ב‑Ctrl+C הוא שולח ל‑ComfyUI בקשה לעצור |
| `_common.py` | עזרי בטיחות משותפים: הסתרת פרטים מזהים, HTTP מקומי בלבד, ואיתור תוכנות בלי לחפש בתיקייה הנוכחית |
| `compare.py` | מפיק את `results/report.md` מההרצות ומציוני המדרגים (`results/scores.csv`) |
| `candidates.json` | רשימת המועמדים לפי עדיפות, עם נפח הורדה וסטטוס רישוי לכל קובץ |

## סדר עבודה

```bash
py -B env_check.py --disk D:\                     # 1. סביבה – ראו STEP0_WINDOWS.md
# 2. התקנת ComfyUI והורדת מודל אחד בלבד – רק אחרי אישור (ראו OPEN_MODEL_EVALUATION §6)
# 3. ב-ComfyUI: פתיחת התבנית הרשמית → Workflow → Export (API) → workflows/<name>_api.json
py -B measure.py --model wan-animate-2-distill-int8 --profile int8-480p-77f --case SMOKE --seed 1 \
  --input ref.png --input drive.mp4 --outputs out/smoke1 -- \
  python comfy_run.py workflows/wan_animate2_distilled_api.json --out out/smoke1 --free-before \
  --upload ref.png --upload drive.mp4
py -B compare.py                                 # 4. דוח
```

בהרצה השתמשו בשמות הקבצים שבתבנית ובמזהי הצמתים, וקבעו ערכים עם `--set NODE.inputs.KEY=VALUE`.

## הערות

- `measure.py` מודד את הזיכרון שבשימוש בכל ה‑GPU. לכן הוא רושם גם baseline לפני ההרצה וגם את ההפרש. כדי למדוד מודל אחד בנקיון, הריצו עם `--free-before`.
- תיקיית `results/` לא נכנסת ל‑git. היא מכילה תוצרי מדיה ויומנים מקומיים.
