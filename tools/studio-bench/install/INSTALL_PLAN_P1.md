# תוכנית התקנה P1: ‏Qwen-Image-Edit-2511 על מחשב ה‑GPU

**היעד:** להריץ את Qwen-Image-Edit-2511 מקומית, ליצור כמה זוויות של דמות מאוירת מקורית, ולמדוד ביצועים. אחרי זה: הנפשה עם Wan-Animate (P2, בתוכנית נפרדת).

**כללי ברזל:**
- כל שלב מסומן ★ מתבצע רק אחרי אישור מפורש.
- הסקריפטים לא נוגעים ב‑Topaz, בדרייברים, ב‑PATH, ברג'יסטרי או ב‑Python של המערכת.
- כל מה שנוצר נמצא תחת `C:\GREENTEC`.

---

## 1. מה ידוע על המחשב (משלב 0)

| נתון | ערך | משמעות |
|---|---|---|
| ‏Windows 11 Pro, build 26300 | — | ‏tar.exe ו‑curl.exe מובנים במערכת |
| ‏RTX PRO 5000 Blackwell, ‏48,935MiB, ‏compute 12.0 | — | ‏Blackwell (sm_120) |
| דרייבר **573.42** | **חוסם** | ‏ComfyUI v0.46.0 מגיע עם PyTorch על **CUDA 13.0**. ‏CUDA 13.x דורש **דרייבר 580 ומעלה** [ראשי: ‏NVIDIA CUDA 13.5 Release Notes, טבלה 3]. ‏573.42 מספיק רק עד CUDA 12.8 Update 1. ‏ComfyUI מציין ש‑"cu130 or above is required on Nvidia 20 series and above" [ראשי: ‏ComfyUI docs/installation.md] |
| ‏VRAM בשימוש 16.4GB, טמפרטורה 72°C | אזהרה | בזמן הבדיקה משהו השתמש בכרטיס, אולי Topaz. **צריך בדיקה חוזרת כשהכרטיס פנוי** (P1.0) |
| ‏RAM: ‏63.4GB, מתוכם 22GB פנויים | אזהרה | טעינת כ‑30GB של קובצי מודל צריכה כ‑35GB פנויים [הערכה]. לסגור יישומים כבדים לפני הרצה |
| כונן C: ‏3.1TB פנויים | תקין | הכל יותקן ב‑`C:\GREENTEC` |
| ‏Python Launcher לא נמצא | תקין | לא נדרש. בגרסה הניידת של ComfyUI יש Python 3.13 מבודד (`python_embeded`) |
| ‏FFmpeg 9.1 | תקין | ‏— |

## 2. דרישות אחסון וזיכרון ל‑P1

**אחסון בכונן C:**

| פריט | נפח | מקור |
|---|---|---|
| ‏ComfyUI v0.46.0, גרסה ניידת (‏.7z) | ‏2.09GB להורדה. גודל אחרי חילוץ: לא ידוע, כ‑6–8GB [הערכה] | גודל ההורדה מ‑GitHub [ראשי] |
| ‏`qwen_image_edit_2511_int8_convrot` | ‏20.50GB | ‏HF API [ראשי] |
| ‏`qwen_2.5_vl_7b_fp8_scaled` (מקודד טקסט) | ‏9.38GB | ‏HF API [ראשי] |
| ‏`qwen_image_vae` | ‏0.25GB | ‏HF API [ראשי] |
| ‏LoRA ‏Multiple-Angles | ‏0.30GB | ‏HF API [ראשי] |
| ‏LoRA ‏Lightning (אופציונלי, מאיץ) | ‏0.85GB | ‏HF API [ראשי] |
| **סך ההורדה** | **‏33.4GB** (‏32.5GB בלי Lightning) | — |
| **סך הכל בדיסק, כולל חילוץ ותוצרים** | כ‑45GB [הערכה]. הסקריפט דורש 60GB פנויים | — |

**זיכרון:** אין נתון רשמי לצריכה של Qwen-Image-Edit-2511. מה שידוע:
- המשקולות של המודל, המקודד וה‑LoRA מסתכמות בכ‑31GB.
- ‏ComfyUI טוען את מקודד הטקסט ואת המודל בשלבים, ומוריד מהזיכרון מה שלא נחוץ.
- ההערכה היא שיא מתחת ל‑48GB בתמונה של כ‑1MP [הערכה].

**המדידה בשלב P1.5 היא שקובעת.** תנאי ההרצה:
- **הכרטיס פנוי:** פחות מ‑4GB בשימוש לפני ההרצה.
- **‏RAM פנוי:** 35GB לפחות.

## 3. השלבים

| שלב | מה | הרשאות | אישור |
|---|---|---|---|
| **P1.0** | הורדת כלי הבדיקה (§4), והרצת `p1_precheck.ps1`. **הכלי קורא נתונים בלבד:** דרייבר, דיסק, ‏RAM, כלים מובנים, ‏Topaz, ובדיקת עומס של 15 שניות על הכרטיס. **לפני ההרצה סוגרים את Topaz וכל רינדור** | רגילות | **מאושר במסגרת "קריאה בלבד"** |
| **P1.1** ★ | **עדכון דרייבר ל‑R580 U12 ‏(582.99)** לפי הנוהל ב‑§5, עם גיבוי ונקודת שחזור | מנהל | ★ |
| **P1.2** ★ | התקנת ComfyUI: קודם הרצת ניסיון, אחר כך `-Execute`. כולל אימות SHA256 רשמי, חילוץ, והפניית תיקיית המודלים. ‏**PyTorch נבדק מול הכרטיס עוד לפני ש‑ComfyUI עולה** | רגילות | ★ |
| **P1.3** ★ | הורדת חמשת הקבצים (‏31.3GB). כל קובץ מאומת בגודל וב‑SHA256. אם ההורדה נקטעת, היא ממשיכה מאותה נקודה | רגילות | ★ |
| **P1.4** | `-Stage Verify` והפעלה ראשונה עם `p1_launch.ps1`. ‏ComfyUI מאזין רק במחשב הזה, במצב offline, בלי הורדות עצמאיות | רגילות | כלול ב‑P1.2 |
| **P1.5** | המבחן: האיור המקורי, ממנו שש זוויות בתבנית הרשמית "Generate Multiple Angles with 3D Camera Node" ‏(`template_qwen_multiangle.app`), עם מדידה (§6) | רגילות | — |

**החזרה לאחור של P1.2 עד P1.4:** מוחקים את `C:\GREENTEC\ComfyUI_v0.46.0` ואת `C:\GREENTEC\models`. שום דבר אחר במחשב לא השתנה.

## 4. הורדת הכלים (P1.0)

פותחים PowerShell (לא כמנהל) ומדביקים:

```powershell
$base = 'https://raw.githubusercontent.com/jon2485/greentec/claude/greentec-ai-film-studio-et0z9z/tools/studio-bench'
$dst = 'C:\GREENTEC\studio-bench'
New-Item -ItemType Directory -Force "$dst\install", "$dst\workflows" | Out-Null
Invoke-WebRequest "$base/SHA256SUMS.txt" -OutFile "$dst\SHA256SUMS.txt"
foreach ($l in Get-Content "$dst\SHA256SUMS.txt") {
  $h, $f = $l -split '\s+', 2
  $out = Join-Path $dst ($f -replace '/', '\')
  Invoke-WebRequest "$base/$f" -OutFile $out
  $ok = (Get-FileHash $out -Algorithm SHA256).Hash -eq $h.ToUpper()
  '{0}  {1}' -f $(if ($ok) {'OK  '} else {'BAD!'}), $f
}
(Get-FileHash "$dst\SHA256SUMS.txt" -Algorithm SHA256).Hash
```

**בודקים שני דברים:**
- כל השורות צריכות להיות `OK`.
- המספר האחרון שמודפס הוא החתימה של קובץ הרשימה עצמו, והוא צריך להיות זהה לחתימה שאשלח בצ'אט.

אם אחד מהם לא מתקיים, לא מריצים.

**אחר כך הבדיקה המקדימה, שקוראת נתונים בלבד:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_precheck.ps1
```

הפרמטר `-ExecutionPolicy Bypass` חל רק על החלון הזה, ולא משנה שום הגדרה. הדוח נשמר ב‑`C:\GREENTEC\studio-bench\install\results\`, ושולחים לי אותו.

## 5. נוהל עדכון הדרייבר (P1.1 ★), עם אפשרות חזרה לאחור

**ענף הדרייבר:** ‏NVIDIA RTX Enterprise **Production Branch, ‏R580 U12, גרסה 582.99** (21.10.2026, ‏WHQL) [ראשי: רשימת הדרייברים ב‑nvidia.com].
- ‏Production Branch נועד ליציבות לטווח ארוך.
- לפי NVIDIA, הוא כולל גם את התכונות של Studio Driver באותה גרסה.
- ‏582.99 עומד בדרישת "580 ומעלה" של CUDA 13.

**לפני העדכון:**
1. שומרים עבודה, וסוגרים את **Topaz** וכל תוכנה שמשתמשת בכרטיס.
2. רושמים את המצב הקיים. ב‑PowerShell **כמנהל**:
   ```powershell
   nvidia-smi --query-gpu=driver_version --format=csv
   pnputil /enum-drivers /class Display
   ```
   מהרשימה מחפשים את השורה של NVIDIA, ורושמים את ה‑`Published Name` שלה (למשל `oem42.inf`).
3. **גיבוי חבילת הדרייבר הנוכחית.** הפקודה מעתיקה את החבילה ולא משנה שום דבר:
   ```powershell
   pnputil /export-driver oem42.inf C:\GREENTEC\driver-backup\573.42
   ```
   במקום `oem42.inf` כותבים את השם שרשמתם בשלב 2.
4. **נקודת שחזור:**
   ```powershell
   Checkpoint-Computer -Description 'Before NVIDIA 582.99' -RestorePointType MODIFY_SETTINGS
   ```
   - אם הגנת המערכת כבויה בכונן C, הפקודה תיכשל. **לא מפעילים אותה בלי אישור**, ואז מסתמכים על הגיבוי משלב 3.
   - ‏Windows מאפשר נקודת שחזור אחת ל‑24 שעות.
5. **שמירת מתקין 573.42** (אם עדיין יש אותו), כחלופה נוספת לחזרה.

**העדכון:**

6. מורידים מ‑nvidia.com, בדף הדרייברים, עם הבחירות:
   - ‏RTX PRO 5000 Blackwell;
   - ‏Windows 11;
   - ‏Production Branch.

   מוודאים שהגרסה היא **582.99**.
7. בודקים את החתימה הדיגיטלית:
   ```powershell
   Get-AuthenticodeSignature .\<שם-הקובץ>.exe | Format-List Status, SignerCertificate
   ```
   התוצאה צריכה להיות `Status: Valid`, עם חותם **NVIDIA Corporation**.
8. מריצים את ההתקנה:
   - בוחרים **Custom**, ומסמנים רק את **Graphics Driver**, ועוד רכיבים שכבר מותקנים היום.
   - **לא** מסמנים "Perform a clean installation". האפשרות הזו מאפסת הגדרות ופרופילים, ואין בה צורך כרגע.
9. מפעילים מחדש את המחשב.

**אחרי העדכון:**

10. ‏`nvidia-smi` צריך להציג את הגרסה **582.99**.
11. מריצים שוב את `p1_precheck.ps1`. הבדיקה `driver` צריכה לצאת PASS.
12. **בדיקת Topaz:** פותחים, ומריצים עבודה קצרה מוכרת. רושמים אם היא עבדה, ואת הזמן.

**חזרה לאחור, אם משהו לא עובד.** מנסים לפי הסדר:
1. מנהל ההתקנים (Device Manager) → Display adapters → ‏RTX PRO 5000 → Properties → Driver → **Roll Back Driver**.
2. התקנה מהגיבוי, כמנהל:
   ```powershell
   pnputil /add-driver C:\GREENTEC\driver-backup\573.42\*.inf /install
   ```
3. התקנה מחדש של 573.42 מהמתקין ששמרתם.
4. שחזור מערכת לנקודה משלב 4.

**שימו לב:** ‏Windows Update עלול להחליף דרייבר בעצמו. אם הגרסה השתנתה בלי שהתקנתם, מדווחים לי.

## 6. מבחן P1.5: זוויות מדמות מקורית, ומדידה

1. **סגירת עומס:** סוגרים את Topaz ורינדורים אחרים. ‏`p1_precheck.ps1` צריך להראות `gpu_idle: PASS` (פחות מ‑4GB בשימוש, ניצולת מתחת ל‑10%, מתחת ל‑65°C).
2. **הפעלה:**
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_launch.ps1
   ```
   הדפדפן נפתח בכתובת `http://127.0.0.1:8188`.
3. **פתיחת התבנית:** ‏Templates → "Generate Multiple Angles with 3D Camera Node". שמות הקבצים בתבנית זהים לקבצים שהותקנו. אם ComfyUI מציע להוריד קבצים, **לא מאשרים**, ומדווחים לי.
4. **הרצת עשן:** האיור המקורי וזווית אחת. בדיקה שהתהליך עובד.
5. **ייצוא למדידה:** ‏Workflow → Export (API), ושמירה בשם `C:\GREENTEC\studio-bench\workflows\qwen_multiangle_api.json`.
6. **שש זוויות במדידה:** חזית, ‏3/4 שמאל, פרופיל שמאל, גב, פרופיל ימין ו‑3/4 ימין. כל אחת דרך `measure.py` ו‑`comfy_run.py`, עם אותו seed. את הפקודה המדויקת, עם מזהי הצמתים, אכין מתוך הקובץ שתייצא.
7. **שתי תצורות להשוואה:** עם LoRA ‏Lightning (‏4 צעדים) ובלעדיו. ההשוואה היא באיכות ובזמן.
8. **ציון:** גיליון השוואה עם האיור המקורי ליד שש הזוויות. ציון 1–5 בזהות, ובחמשת מדדי הנאמנות האמנותית (קווים, צבעים, פרופורציות, פנים, סגנון).

**נמדד ונרשם:**
- זמן לתמונה;
- שיא VRAM ו‑RAM;
- כשלים לפי סוג;
- גרסת workflow;
- ‏seed;
- ‏sha256 לכל תוצר.

## 7. מה קורה אם

| מצב | מה עושים |
|---|---|
| ‏`p1_install` עוצר באמצע ההורדה | מריצים אותה פקודה שוב. ההורדה ממשיכה מאותה נקודה |
| ‏SHA256 לא תואם | הקובץ עובר ל‑`quarantine` ומורד שוב פעם אחת. אם שוב לא תואם, הסקריפט עוצר ושולחים לי את הלוג |
| לא נמצאה חתימה רשמית ל‑ComfyUI | הסקריפט עוצר. ממשיכים עם `-AllowNoDigest` רק באישור |
| ‏tar לא מצליח לחלץ את ה‑‎.7z | מחלצים ב‑File Explorer לתוך `C:\GREENTEC\_extract_tmp`, ומריצים שוב |
| ‏env_check אחרי החילוץ מדווח שאין kernels לכרטיס | עוצרים ולא מפעילים את ComfyUI. מדווחים לי |
| ‏OOM בהרצה | נרשם אוטומטית. ניסיון אחד ברזולוציה נמוכה יותר, ואז עוצרים ומנתחים |

כל הלוגים נשמרים ב‑`C:\GREENTEC\logs\`.

## 8. השלב הבא, P2: ‏Wan-Animate-2 (רק אחרי ש‑P1 הצליח)

- **הורדה:** ‏24.9GB, מ‑`Comfy-Org/Wan-Animate-2`, ברישיון Apache-2.0 [ראשי].
- **שיטה:** אותו מנגנון של מניפסט נעול, sha256 והתקנה בשלבים.
- **סיכון הזיכרון הגבוה ביותר:** היצרן פרסם נתונים רק להרצה על כמה כרטיסי A800, ולכן הוא נמדד ראשון ב‑480p.
- **מה צריך ממך:** סרטון ביצוע של 5–10 שניות, עם הסכמת המצולם.

---

**מה לא נבדק:** הסקריפטים לא הורצו ב‑Windows. בסביבת הפיתוח אין Windows, והתקנת PowerShell לבדיקה לא אושרה. נבדקו רק איזון הסוגריים ו‑quoting, וסקירה ידנית. לכן:
- `p1_precheck.ps1` קורא נתונים בלבד;
- `p1_install.ps1` רץ כברירת מחדל כהרצת ניסיון בלבד;
- ההרצה הראשונה אצלך היא גם הבדיקה הראשונה שלהם.
