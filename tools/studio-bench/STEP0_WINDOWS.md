# שלב 0: בדיקת סביבה על מחשב ה‑GPU (Windows)

**מה הבדיקה עושה:** קוראת נתונים על המחשב: מערכת ההפעלה, זיכרון ה‑RAM, מקום פנוי בכוננים, כרטיס המסך ודרייבר NVIDIA. אם כבר מותקנים במחשב גם Python ו‑PyTorch, היא בודקת גם אותם, ואת FFmpeg ו‑ComfyUI אם הם קיימים.

**מה הבדיקה לא עושה:**
- לא מתקינה ולא מורידה שום דבר, ולא משנה דרייברים או הגדרות מערכת.
- לא שולחת מידע לאינטרנט. התוצאה נשארת אצלך, ואתה מחליט אם לשלוח.
- הדבר היחיד שהיא כותבת הוא קובץ תוצאות אחד, בתוך התיקייה שלה (`results\`).

אם PyTorch מותקן כבר במחשב, הבדיקה מריצה עליו חישוב קטן של כמה שניות על כרטיס המסך, כדי לוודא שהוא עובד. החישוב לא כותב שום דבר. אפשר לדלג עליו עם `--no-gpu-test`.

---

## אפשרות 1: עם Python (אם כבר מותקן)

### 1. יצירת התיקייה

פתחו **PowerShell** (לחצן התחל, מקלידים PowerShell, Enter) והדביקו:

```powershell
New-Item -ItemType Directory -Force C:\GREENTEC\studio-bench | Out-Null
```

### 2. הורדת הקובץ (קובץ טקסט אחד, כ‑10KB)

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/jon2485/greentec/claude/greentec-ai-film-studio-et0z9z/tools/studio-bench/env_check.py" -OutFile C:\GREENTEC\studio-bench\env_check.py
```

אפשר גם להוריד מהדפדפן: פותחים את הכתובת שלמעלה, לוחצים Ctrl+S, ושומרים בשם `env_check.py` בתיקייה `C:\GREENTEC\studio-bench`. בסוג הקובץ בוחרים "כל הקבצים", כדי שלא יישמר כ‑`.txt`.

### 3. אימות שהקובץ לא שונה

```powershell
Get-FileHash C:\GREENTEC\studio-bench\env_check.py -Algorithm SHA256
```

התוצאה חייבת להיות זהה **בדיוק** לערך הבא:

```
SHA256: __HASH__
```

אם הערך שונה, **לא מריצים**, ושולחים לי את מה שהתקבל.

### 4. בדיקה שיש Python

```powershell
py --version
```

- **אם מופיעה גרסה** (למשל `Python 3.12.x`), ממשיכים לשלב 5.
- **אם מופיעה שגיאה, או ש‑Microsoft Store נפתח: לא מתקינים כלום.** עוברים לאפשרות 2 למטה.

### 5. הרצה

מחליפים את `D:\` בכונן שבו תרצה לשמור את המודלים בעתיד. אם יש רק כונן C, כותבים `C:\`.

```powershell
cd C:\GREENTEC\studio-bench
py env_check.py --disk D:\
```

הבדיקה נמשכת עד כדקה. בסוף היא כותבת `No blocking problems found`, או רשימת בעיות, ואת הנתיב של קובץ התוצאות:

```
C:\GREENTEC\studio-bench\results\env-YYYYMMDD-HHMMSS.json
```

### 6. שליחה

1. פותחים את הקובץ ב‑Notepad ובודקים מה יש בו.
2. שם המשתמש, שם המחשב ותיקיית הבית מוחלפים אוטומטית ב‑`<USER>`, ‏`<HOST>` ו‑`<HOME>`. אם נשאר משהו שלא תרצה לשלוח, מוחקים אותו.
3. שולחים לי את הקובץ, או מדביקים את תוכנו בשיחה.

---

## אפשרות 2: בלי Python, פקודות PowerShell לקריאה בלבד

מדביקים את הפקודות האלה ב‑PowerShell, אחת אחרי השנייה, ושולחים לי את כל הפלט:

```powershell
nvidia-smi --query-gpu=name,driver_version,memory.total,compute_cap,power.limit --format=csv
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
Get-CimInstance Win32_ComputerSystem | Select-Object @{n='RAM_GB';e={[math]::Round($_.TotalPhysicalMemory/1GB,1)}}
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n='Free_GB';e={[math]::Round($_.Free/1GB,1)}}, @{n='Used_GB';e={[math]::Round($_.Used/1GB,1)}}
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, @{n='Size_GB';e={[math]::Round($_.Size/1GB)}}
```

הפקודות לא כוללות `nvidia-smi` בלי פרמטרים, כי במצב הזה הוא מציג גם נתיבים מלאים של תוכנות שרצות.

---

## אם משהו לא עובד

| מה רואים | מה זה אומר |
|---|---|
| ‏`nvidia-smi` לא מוכר | הדרייבר של NVIDIA לא מותקן או לא בנתיב. **לא מתקינים לבד.** מספרים לי |
| ‏`Invoke-WebRequest` נכשל | מורידים מהדפדפן (שלב 2) |
| ‏PowerShell חוסם הרצה | הבדיקה לא מריצה סקריפט של PowerShell, כך שלא צריך לשנות הגדרות. אם יש שגיאה, שולחים לי צילום מסך |
| ‏`torch not installed` | זה תקין. PyTorch יותקן רק בשלב 1, באישורך |

**אחרי קבלת התוצאות** אכין תוכנית התקנה מדויקת ומדורגת ל‑Qwen-Image-Edit-2511, עם דרישות אחסון וזיכרון. **שום התקנה לא תתחיל לפני האישור שלך.**
