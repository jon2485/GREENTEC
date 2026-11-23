export const metadata = { title: 'ניהול · גרינטק', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300..700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/t/vendor/bootstrap.rtl.min.css" />
        <link rel="stylesheet" href="/admin-assets/admin.css" />
        <link rel="icon" href="/t/assets/images/logo-v.png" />
      </head>
      <body className="adm">
        {children}
        <script src="/t/vendor/bootstrap.bundle.min.js" defer></script>
        <script src="/admin-assets/admin.js" defer></script>
        <script src="/admin-assets/legacy-import.js" defer></script>
      </body>
    </html>
  );
}
