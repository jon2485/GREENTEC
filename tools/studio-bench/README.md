# studio-bench: מדידות אמיתיות על מחשב ה‑GPU

כלים קטנים שמבוססים על Python בלבד. אין בהם הורדות ואין בהם התקנות. הם מתעדים כל ניסיון של מודל על ה‑RTX PRO 5000: זמן, שיא VRAM ו‑RAM, כשל או הצלחה, ותוצרים עם sha256. אחר כך הם מפיקים דוח השוואה.

**שום דבר כאן לא מוכיח איכות בלי הרצה אמיתית וצפייה אנושית.** התוכנית המלאה נמצאת ב‑`docs/OPEN_MODEL_EVALUATION.md`.

| קובץ | מה הוא עושה |
|---|---|
| `env_check.py` | דוח סביבה לקריאה בלבד: מערכת הפעלה, דרייבר, CUDA, ‏PyTorch ותמיכה ב‑Blackwell, בדיקת bf16 קצרה, דיסק, FFmpeg (האם נבנה עם GPL או nonfree), ‏ComfyUI |
| `measure.py` | מריץ פקודה, דוגם ‏VRAM ו‑RAM כל חצי שנייה, ורושם שורה ב‑`results/runs.jsonl`, **גם כשההרצה נכשלת**. הכשלים מסווגים: ‏oom, ‏missing_model, ‏missing_node, ‏cuda_arch, ‏nan, ‏timeout |
| `comfy_run.py` | מריץ workflow של ComfyUI בפורמט API, ושומר את התוצרים ואת הגרף המדויק שרץ |
| `compare.py` | מפיק את `results/report.md` מההרצות ומציוני המדרגים (`results/scores.csv`) |
| `candidates.json` | רשימת המועמדים לפי עדיפות, עם נפח הורדה וסטטוס רישוי לכל קובץ |

## סדר עבודה

```bash
python env_check.py --disk D:\studio            # 1. סביבה – לשלוח את הקובץ שנוצר ב-results/
# 2. התקנת ComfyUI והורדת מודל אחד בלבד – רק אחרי אישור (ראו OPEN_MODEL_EVALUATION §6)
# 3. ב-ComfyUI: פתיחת התבנית הרשמית → Workflow → Export (API) → workflows/<name>_api.json
python measure.py --model wan-animate-2-distill-int8 --profile int8-480p-77f --case SMOKE --seed 1 \
  --input ref.png --input drive.mp4 --outputs out/smoke1 -- \
  python comfy_run.py workflows/wan_animate2_distilled_api.json --out out/smoke1 --free-before \
  --upload ref.png --upload drive.mp4
python compare.py                                # 4. דוח
```

בהרצה השתמשו בשמות הקבצים שבתבנית ובמזהי הצמתים, וקבעו ערכים עם `--set NODE.inputs.KEY=VALUE`.

## הערות

- `measure.py` מודד את הזיכרון שבשימוש בכל ה‑GPU. לכן הוא רושם גם baseline לפני ההרצה וגם את ההפרש. כדי למדוד מודל אחד בנקיון, הריצו עם `--free-before`.
- תיקיית `results/` לא נכנסת ל‑git. היא מכילה תוצרי מדיה ויומנים מקומיים.
