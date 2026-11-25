# תוכנית התקנה P1: ‏Qwen-Image-Edit-2511 על מחשב ה‑GPU (גרסה 2)

**היעד:** להריץ את Qwen-Image-Edit-2511 מקומית, ליצור כמה זוויות של דמות מאוירת מקורית, ולמדוד ביצועים. אחרי זה: הנפשה עם Wan-Animate (P2).

**כללי ברזל:**
- כל שלב מסומן ★ מתבצע רק אחרי אישור מפורש.
- הסקריפטים לא נוגעים ב‑Topaz, בדרייברים, בחומת האש, ב‑PATH, ברג'יסטרי או ב‑Python של המערכת.
- כל מה שנוצר נמצא תחת `C:\GREENTEC`.
- כל מקור נעול לגרסה או ל‑commit, וכל קובץ נעול לגודל ול‑SHA256.

---

## 1. מה ידוע על המחשב (שלב 0)

| נתון | משמעות |
|---|---|
| ‏Windows 11 Pro, ‏build 26300 | ‏`tar.exe` ו‑`curl.exe` מובנים במערכת |
| ‏RTX PRO 5000 Blackwell, ‏48,935MiB, ‏compute 12.0 | הדגם המדויק לפי NVIDIA: **NVIDIA RTX PRO 5000 48GB Blackwell** |
| דרייבר **573.42** | **חוסם.** ‏ComfyUI v0.46.0 מגיע עם **torch 2.14.1+cu130** (נבדק בתוך הארכיון). ‏CUDA 13.x דורש **דרייבר 580 ומעלה** [ראשי: ‏NVIDIA CUDA 13.5 Release Notes, טבלה 3] |
| ‏16.4GB ‏VRAM בשימוש, ‏72°C | בזמן הבדיקה היה עומס על הכרטיס. בודקים שוב כשהוא פנוי |
| ‏RAM: ‏22GB פנויים מתוך 63.4GB | הרצה צריכה כ‑35GB פנויים [הערכה] |
| כונן C: ‏3.1TB פנויים | ‏— |
| אין Python Launcher | לא נדרש: הגרסה הניידת של ComfyUI כוללת Python 3.13 מבודד |

## 2. מקורות נעולים (`p1_manifest.json`)

| רכיב | נעילה | אימות |
|---|---|---|
| ‏ComfyUI v0.46.0 portable | ‏tag ב‑commit ‏`a277b5bf…`. קובץ `ComfyUI_windows_portable_nvidia.7z`, ‏2,085,169,944 בתים, ‏SHA256 ‏`6a5255c7…5fac6` | **הורד וחושב בפועל** בסביבת הפיתוח. ההתקנה משווה גם ל‑digest הרשמי של GitHub, אם הוא זמין |
| תוכן הארכיון | ‏torch ‏2.14.1+cu130, ‏Python 3.13, ‏custom_nodes עם 2 קבצים בלבד (SHA256 נעולים), **בלי ComfyUI-Manager** | **חולץ ונבדק** עם libarchive 3.7.2, הספרייה ש‑`tar.exe` של Windows משתמש בה. הארכיון משתמש במסנן BCJ2. גודל אחרי חילוץ: 4.5GB |
| תבנית Multiple Angles | העותק שמגיע **בתוך** ComfyUI ‏(`comfyui_workflow_templates_json 0.1.137`), ‏SHA256 ‏`0559608d…`. צמתים מובנים בלבד | נבדק בארכיון |
| חמשת קובצי המודל | ‏revision מלא ב‑Hugging Face, גודל ו‑SHA256 לכל קובץ | ‏HF API, וגם כותרת `x-linked-etag` ששווה ל‑SHA256 |
| כלי הבדיקה וההתקנה | קבצים מ‑commit מסוים, וכל קובץ עם SHA256 ב‑`SHA256SUMS.txt` | §4 |

**הורדה רק מכתובות מאושרות:** ‏github.com, ‏api.github.com, ‏release-assets.githubusercontent.com, ‏objects.githubusercontent.com, ‏huggingface.co, ו‑`*.hf.co` (שרת ההפצה של Hugging Face).
- לפני כל הורדה נבדקת כל שרשרת ההפניות.
- כתובת מחוץ לרשימה עוצרת את ההתקנה.
- ‏curl רץ עם `--proto =https --proto-redir =https`.

## 3. דרייבר: בחירה מאומתת לדגם המדויק

**תיקון של התוכנית הקודמת:** הגרסה 582.99 שהמלצתי עליה **לקוחה מרשימה של מוצר אחר** (‏Quadro P5000 Notebook), **והיא לא מוצעת לכרטיס שלך.**

הרשימה הנכונה נבדקה בשאילתה הרשמית של NVIDIA, לדגם NVIDIA RTX PRO 5000 48GB Blackwell (‏psid=132, ‏pfid=1080) ול‑Windows 11 (‏osid=135). כל הגרסאות בה הן Production Branch ו‑WHQL:

| גרסה | ענף | שוחרר | המלצה |
|---|---|---|---|
| ‏621.40 | ‏R620 U3 | ‏24.11.2026 | **לא עכשיו.** שוחרר אתמול |
| **‏621.14** | ‏R620 U1 | ‏4.11.2026 | **מומלץ.** הענף העדכני ביותר, ובשוק כבר שלושה שבועות |
| ‏596.59 | ‏R595 U5 | ‏27.5.2026 | אפשרי |
| ‏582.53 | ‏R580 U9 | ‏28.4.2026 | **חלופה שמרנית.** הוותיקה ביותר שעדיין בגרסה 580 ומעלה |
| ‏573.96 | ‏R570 U12 | ‏8.1.2026 | **לחזרה לאחור בלבד** (לא תומך ב‑CUDA 13) |

הגרסה הנוכחית שלך, 573.42, לא מופיעה ברשימה של NVIDIA לדגם הזה.

## 4. שלב P1.0: בדיקות לפני כל התקנה

**P1.0 כולל שתי בדיקות נפרדות.** שתיהן לא מתקינות ולא משנות דבר:

| בדיקה | מה היא עושה | רשת | כותבת |
|---|---|---|---|
| `p1_precheck.ps1` | **בדיקה מקומית:** ‏Windows, דיסק, ‏RAM, דרייבר, דגם מדויק, ‏Visual C++ runtime (קריאת רג'יסטרי בלבד), ‏tar ו‑curl, תיקיות ‏GREENTEC, וזיהוי Topaz. **"Idle snapshot":** 15 שניות של **צפייה בלבד** בניצולת, ב‑VRAM ובטמפרטורה. **זה לא מבחן עומס, ולא מופעל שום חישוב** | **לא** | קובץ אחד: `results\p1_precheck-*.json` |
| `p1_netcheck.ps1` | **בדיקת אינטרנט:** בקשות HEAD בלבד לכתובות ההורדה הנעולות, ובדיקה שכל שרשרת ההפניות נמצאת ברשימה המאושרת. **לא מוריד שום קובץ** | כן, HEAD בלבד | קובץ אחד: `results\p1_netcheck-*.json` |

**קוד יציאה:** 0 אם הכל תקין, 2 אם יש פריט חוסם.

**שתי הבדיקות מסתירות פרטים מזהים:** שם המשתמש, שם המחשב ותיקיית הבית לא נשמרים בדוח. מ‑nvidia-smi נשמרים שמות תוכנות בלבד, בלי נתיבים.

### איך מריצים

**לפני ההרצה:** סוגרים את Topaz וכל רינדור. ב‑PowerShell רגיל (לא כמנהל), מדביקים:

```powershell
$commit = '__COMMIT__'
$base = "https://raw.githubusercontent.com/jon2485/greentec/$commit/tools/studio-bench"
$dst = 'C:\GREENTEC\studio-bench'
New-Item -ItemType Directory -Force "$dst\install", "$dst\workflows" | Out-Null
Invoke-WebRequest "$base/SHA256SUMS.txt" -OutFile "$dst\SHA256SUMS.txt" -UseBasicParsing
$bad = 0
foreach ($l in Get-Content "$dst\SHA256SUMS.txt") {
  $h, $f = $l -split '\s+', 2
  $out = Join-Path $dst ($f -replace '/', '\')
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  Invoke-WebRequest "$base/$f" -OutFile $out -UseBasicParsing
  if ((Get-FileHash $out -Algorithm SHA256).Hash -ne $h.ToUpper()) { $bad++; "BAD  $f" } else { "OK   $f" }
}
"SHA256SUMS: " + (Get-FileHash "$dst\SHA256SUMS.txt" -Algorithm SHA256).Hash
"bad files: $bad"
```

**בודקים שני דברים:**
- `bad files: 0`.
- ערך ה‑`SHA256SUMS` שמודפס זהה לערך ששלחתי בצ'אט.

הקבצים יורדים מ‑commit קבוע ולא מענף, כך שהתוכן לא יכול להשתנות בלי שהחתימה תשתנה. אם אחד משני הדברים לא מתקיים, לא מריצים.

**אחר כך:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_precheck.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_netcheck.ps1
```

**מה הבדיקה המקומית צפויה להראות:**
- `driver: FAIL`, כי 573.42 נמוך מ‑580. זה צפוי, ולכן העדכון הוא השלב הבא.
- אם הכרטיס פנוי: `gpu_idle_snapshot: PASS`.

**שולחים לי את שני הדוחות** מהתיקייה `C:\GREENTEC\studio-bench\install\results`.

**הרצת ניסיון (אופציונלי, מותר ב‑P1.0):**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_install.ps1 -Stage ComfyUI
```

- **מה היא כותבת:** קובץ אחד בלבד, הלוג `install\results\p1_install-ComfyUI-<זמן>-dryrun.log`.
- **מה היא לא עושה:** לא יוצרת תיקיות ב‑`C:\GREENTEC`, ולא מורידה, מחלצת, מעבירה או מוחקת שום דבר.
- **רשת:** בקשות HEAD לבדיקת המקורות, וקריאה אחת ל‑API של GitHub.
- **הוכחה שלא השתנה דבר:** היא רושמת את כל הקבצים תחת `C:\GREENTEC` לפני ההרצה ואחריה, ומדפיסה `dry run verified …`.
- **קוד יציאה:** 2 כל עוד הדרייבר ישן.

## 5. השלבים אחרי P1.0

| שלב | מה | אישור |
|---|---|---|
| **P1.1** ★ | עדכון דרייבר ל‑**621.14** (או 582.53 השמרני), לפי §6 | ★ מנהל |
| **P1.2** ★ | `p1_install.ps1 -Stage ComfyUI -Execute`, לפי הסדר: מקורות מאושרים, הורדה עם המשך מנקודת עצירה, גודל ו‑SHA256, חילוץ דרך תיקייה זמנית, בדיקת custom_nodes, בדיקת גרסת torch, ואז **שער GPU** (`env_check.py --require-gpu`) | ★ |
| **P1.3** ★ | `-Stage Models -Execute`: הורדה של 31.3GB, כל קובץ מאומת | ★ |
| **P1.4** | `-Stage Verify`, והפעלה עם `p1_launch.ps1` (§7) | כלול ב‑P1.2 |
| **P1.5** | המבחן: זוויות מהאיור המקורי, עם מדידה | — |

**שער ה‑GPU חוסם את ההמשך** אם PyTorch לא רואה את הכרטיס, אם אין בו kernels מוכנים ל‑sm_120 (‏Blackwell), או אם בדיקת החישוב ב‑bf16 נכשלת או מחזירה ערכים לא תקינים.
- ‏`env_check.py` מחזיר קוד 3, וההתקנה עוצרת **לפני ש‑ComfyUI מופעל**.
- נבדק אוטומטית עם PyTorch מדומה: השער עובר כשיש kernels מוכנים, ונכשל כשאין PyTorch, כשאין kernels מוכנים, או כשהחישוב נכשל.

**חזרה לאחור מ‑P1.2 עד P1.4:** מוחקים את `C:\GREENTEC\ComfyUI_v0.46.0` ואת `C:\GREENTEC\models`.

## 6. עדכון הדרייבר (P1.1 ★) והגנה על Topaz

**אין הבטחה שחזרה לאחור תצליח תמיד.** הנוהל מצמצם את הסיכון, אבל לא מבטל אותו.

**לפני העדכון:**
1. **בדיקת Topaz "לפני":**
   - פותחים את Topaz ומריצים עבודת ייחוס קבועה: אותו קטע קצר, אותו מודל ואותן הגדרות. רושמים את הזמן.
   - מריצים:
     ```powershell
     powershell -NoProfile -ExecutionPolicy Bypass -File C:\GREENTEC\studio-bench\install\p1_topaz_snapshot.ps1 -Label before -JobSeconds <זמן> -OutputFile "<קובץ התוצר>"
     ```
     הפקודה רושמת את גרסת הדרייבר, את גרסאות Topaz המותקנות, ואת ה‑SHA256 של התוצר. היא קוראת נתונים בלבד.
2. **סוגרים** את Topaz וכל תוכנה שמשתמשת בכרטיס.
3. **גיבוי חבילת הדרייבר הנוכחית**, ב‑PowerShell כמנהל:
   ```powershell
   pnputil /enum-drivers /class Display
   ```
   מחפשים את השורה של NVIDIA, ורושמים את ה‑Published Name, למשל `oem42.inf`. אחר כך:
   ```powershell
   pnputil /export-driver oem42.inf C:\GREENTEC\driver-backup\573.42
   ```
4. **שמירת מתקין חלופי:** מורידים מראש את **573.96** ‏(R570 U12) מדף NVIDIA לדגם שלך, ושומרים אותו.
5. **נקודת שחזור:**
   ```powershell
   Checkpoint-Computer -Description 'Before NVIDIA 621.14' -RestorePointType MODIFY_SETTINGS
   ```
   אם הגנת המערכת כבויה, **לא מפעילים אותה בלי אישור**, ומסתמכים על שלבים 3 ו‑4.

**העדכון:**

6. **הורדה:** מ‑nvidia.com, בבחירות:
   - ‏NVIDIA RTX PRO Series;
   - ‏RTX PRO 5000 48GB Blackwell;
   - ‏Windows 11.

   מוודאים שהגרסה היא **621.14**.
7. **חתימה דיגיטלית:**
   ```powershell
   Get-AuthenticodeSignature <הקובץ>
   ```
   צריך להופיע `Valid`, עם החותם NVIDIA Corporation.
8. **התקנה:** בוחרים **Custom**, ומסמנים רק Graphics Driver ועוד רכיבים שכבר מותקנים. **בלי** "clean installation". אחר כך הפעלה מחדש.

**אחרי העדכון:**

9. ‏`nvidia-smi` צריך להציג 621.14, ו‑`p1_precheck.ps1` צריך להראות `driver: PASS`.
10. **בדיקת Topaz "אחרי":**
    - מריצים את אותה עבודת ייחוס.
    - מריצים `p1_topaz_snapshot.ps1 -Label after`.
    - משווים: הזמן צריך להיות בטווח של ±15%, והתוצר צריך להיראות תקין. ה‑hash יכול להשתנות בין הרצות.

**אם Topaz או המערכת לא עובדים, מנסים לפי הסדר:**
1. מנהל ההתקנים → Display adapters → ‏RTX PRO 5000 → Driver → **Roll Back Driver**.
2. התקנה מהגיבוי, כמנהל:
   ```powershell
   pnputil /add-driver C:\GREENTEC\driver-backup\573.42\*.inf /install
   ```
3. התקנה של 573.96 מהמתקין ששמרתם.
4. שחזור מערכת לנקודה משלב 5.

**שימו לב:** ‏Windows Update עלול להחליף דרייבר בעצמו. אם הגרסה השתנתה בלי שהתקנתם, מדווחים.

## 7. פרטיות ובידוד רשת בזמן עבודה על האיורים

`p1_launch.ps1` מפעיל את ComfyUI עם **חמש שכבות הגנה, בלי לשנות את חומת האש:**

1. **בלי קוד צד שלישי:**
   - ‏`--disable-all-custom-nodes`.
   - ההפעלה **נחסמת** אם בתיקיית `custom_nodes` יש משהו מעבר לשני הקבצים המקוריים, לפי SHA256.
   - ‏ComfyUI-Manager לא קיים, ו‑`--enable-manager` לא מועבר.
2. **`--offline`:** ממשק הדפדפן לא פונה לאינטרנט, וצמתי ה‑API בתשלום כבויים.
3. **Proxy שנכשל בכוונה:**
   - ‏`HTTP(S)_PROXY` ו‑`ALL_PROXY` מצביעים על פורט מקומי מת, ו‑`NO_PROXY` משאיר את 127.0.0.1 פעיל.
   - ספריות Python שמכבדות הגדרות Proxy לא יכולות לצאת.
   - ‏`HF_HUB_OFFLINE`, ‏`TRANSFORMERS_OFFLINE` ו‑`HF_DATASETS_OFFLINE` חוסמים הורדות מודלים.
4. **האזנה על 127.0.0.1 בלבד.**
5. **שומר:** כל 2 שניות הוא בודק את חיבורי ה‑TCP של ComfyUI ושל התהליכים שהוא הפעיל.
   - כל חיבור לכתובת שאינה מקומית נרשם ב‑`logs\p1_network-*.log`, עם IP ופורט, **ו‑ComfyUI נעצר מיד.**
   - עם `-WatchOnly` החיבור רק נרשם, בלי עצירה.
   - ComfyUI מופעל עם `--disable-auto-launch`. הדפדפן נפתח על ידי הסקריפט, ולכן התעבורה של הדפדפן לא תיחשב בטעות לתעבורה של ComfyUI.

**מגבלה:** קוד שפותח socket ישיר ומתעלם מ‑Proxy יכול **לנסות** להתחבר. השומר יזהה זאת ויעצור את ComfyUI, אבל ייתכן שכמה חבילות כבר יצאו. רק חוק בחומת האש חוסם מראש.

**אופציונלי, רק באישור מפורש ממך (לא מבוצע אוטומטית):** חוק יציאה בחומת האש, לקובץ ה‑python.exe של ComfyUI בלבד. תעבורה מקומית לא מושפעת.
```powershell
New-NetFirewallRule -DisplayName 'GREENTEC ComfyUI block internet' -Direction Outbound -Action Block -Program 'C:\GREENTEC\ComfyUI_v0.46.0\ComfyUI_windows_portable\python_embeded\python.exe'
```
להסרה:
```powershell
Remove-NetFirewallRule -DisplayName 'GREENTEC ComfyUI block internet'
```

**בזמן ההתקנה** (‏P1.2 ו‑P1.3) הגישה לאינטרנט היא רק לכתובות שברשימה המאושרת (§2).

## 8. מבחן P1.5: זוויות מדמות מקורית

1. **מוודאים** ש‑`p1_precheck.ps1` מראה `gpu_idle_snapshot: PASS`, ושיש כ‑35GB של ‏RAM פנוי.
2. **מפעילים:** `p1_launch.ps1`. הדפדפן נפתח בכתובת `http://127.0.0.1:8188`.
3. **פותחים את התבנית:** ‏Templates → "Generate Multiple Angles with 3D Camera Node". שמות הקבצים בתבנית זהים לקבצים שהותקנו. אם מופיעה הצעה להוריד קבצים, **לא מאשרים**.
4. **הרצת עשן:** האיור וזווית אחת.
5. **ייצוא למדידה:** ‏Export (API), ושמירה בשם `C:\GREENTEC\studio-bench\workflows\qwen_multiangle_api.json`.
6. **שש זוויות במדידה:** כל אחת דרך `measure.py`. את הפקודה המדויקת אכין מתוך הקובץ שתייצא.
7. **השוואה:** עם LoRA ‏Lightning ובלעדיו.
8. **ציון:** זהות, וחמשת מדדי הנאמנות האמנותית.

## 9. בדיקות שבוצעו

**בדיקות אוטומטיות:**
- **GitHub Actions** ‏(`.github/workflows/studio-bench-tests.yml`):
  - **Windows PowerShell 5.1** על windows-latest, עם nvidia-smi.exe מדומה ותיקיות זמניות.
  - בדיקות Python על Windows ועל Linux.
  - תוצאות: §10.
- **מקומית (Linux):** ‏14 בדיקות Python עברו. ההורדה, החישוב והחילוץ של ארכיון ComfyUI נבדקו בפועל.

**מה עדיין לא נבדק:**
- הרצה על המחשב שלך: דרייבר אמיתי, ‏PyTorch אמיתי על הכרטיס, ו‑ComfyUI אמיתי.
- שום מודל לא הורץ.
- ‏Mock לא משמש הוכחה לשום יכולת של מודל.

## 10. דוח בדיקות

**GitHub Actions, הרצה #4** (commit ‏`c97bfe6`, ‏25.11.2026): https://github.com/jon2485/GREENTEC/actions/runs/45625455338

| Job | סביבה | תוצאה |
|---|---|---|
| windows-powershell-5-1 | windows-latest, ‏**Windows PowerShell 5.1.26100** | **58/58 עברו** |
| python-tools | windows-latest, ‏Python 3.13 | **14/14 עברו** |
| python-tools | ubuntu-latest, ‏Python 3.13 | **14/14 עברו** |

**מה נבדק ב‑PowerShell 5.1:**
- **תחביר ו‑ASCII:** ניתוח תחבירי של כל הסקריפטים במפענח של PS 5.1, ובדיקה שכולם ASCII בלבד.
- **רשימת המקורות המאושרים:** סאב‑דומיינים, ‏http, ודומיין מתחזה.
- **בדיקה מקדימה, דרייבר ישן:**
  - קוד יציאה 2;
  - ‏FAIL לדרייבר;
  - התווית "observation, not load test";
  - אין בה בדיקת רשת;
  - נכתב דוח אחד בלבד.
- **בדיקה מקדימה, דרייבר חדש:**
  - ‏PASS לדרייבר ולדגם המדויק;
  - כשהכרטיס עמוס: ‏WARN, ובדוח רק שם התוכנה בלי נתיב.
- **הרצת ניסיון:**
  - קוד 2 עם החוסם "BLOCKER" כשהדרייבר ישן;
  - הדרייבר 621.14 מתקבל;
  - "dry run verified";
  - שום קובץ לא משתנה ושום שורת DO לא מודפסת;
  - נכתב בדיוק לוג אחד.
- **Verify:** מזהה קובץ תקין ומזהה קובץ פגום.
- **[רשת] הורדה אמיתית** של קובץ קטן מ‑Hugging Face:
  - שרשרת ההפניות נבדקת מול הרשימה המאושרת;
  - ‏SHA256 מאומת;
  - בהרצה חוזרת הקובץ מזוהה כ‑"already present";
  - חתימה שגויה: הסגר פעמיים, ועצירה עם קוד 1.
- **[רשת] netcheck:** כתובת מחוץ לרשימה מקבלת קוד 2.
- **הפעלה:** נחסמת כשיש custom node זר.
- **Topaz snapshot:** כותב דוח.

**מה נבדק ב‑Python:**
- **שער ה‑GPU:** עובר כשיש kernels מוכנים, ונכשל כשאין PyTorch, כשאין kernels מוכנים, או כשהחישוב נכשל;
- **פרטיות:** הסתרת פרטים בדוח ובנתיבי Windows;
- **`measure.py`:** הצלחה, ‏OOM, ‏NaN רגיש לאותיות, תוכנה חסרה, ועצירה בחריגת זמן **שהורגת גם תהליכי נכדים**. נבדק גם ב‑Windows;
- **`comfy_run`:** מתעלם מ‑Proxy, העלאה בלי דריסה, הפניה עם `@1`, ושמות קבצים זדוניים;
- **`compare`:** קובץ CSV של Excel.

**באגים שהבדיקות ב‑Windows תפסו ותוקנו.** שלושתם היו שוברים את ההרצה אצלך:
1. ב‑PS 5.1, ‏`$PSScriptRoot` ריק בערכי ברירת המחדל של `param()`. כל הסקריפטים נכשלו בטעינה.
2. ערך יחיד מ‑nvidia-smi הפך למחרוזת, והדרייבר נקרא כ‑**53** במקום 573.42. ההתקנה הייתה נחסמת לצמיתות, גם אחרי עדכון הדרייבר.
3. ‏`Compare-Object` של PS 5.1 נכשל על רשימה ריקה, ולכן הוכחת הרצת הניסיון נפלה כשהתיקייה עוד לא קיימת.

**מה נבדק בסביבת הפיתוח (Linux):**
- ארכיון ComfyUI הורד, וחושב לו SHA256.
- הארכיון חולץ עם libarchive. נבדקו גרסת torch, תוכן custom_nodes והתבנית.

**הגבלות:** ‏nvidia-smi, ‏PyTorch והשרת של ComfyUI היו מדומים בבדיקות. שום מודל לא הורץ, ושום דבר מזה לא מוכיח שהכרטיס או המודל עובדים. זה ייבדק רק במחשב שלך.