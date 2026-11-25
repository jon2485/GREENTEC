// Showcase link for a prospective supplier: the new site's home page, shared with a secret token (SHOWCASE_TOKEN,
// a Railway variable) so the rest of the password-protected staging stays closed. Links, cart and search are inert.
import { notFound } from 'next/navigation';
import Home from '../../page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גרינטק - מוזיקה ותוכן יהודי', robots: { index: false, follow: false } };

const JS = `{
  const note=document.createElement('div');note.setAttribute('role','status');
  note.style.cssText='position:fixed;inset-inline:16px;bottom:20px;margin:0 auto;max-width:420px;background:#2a2b2c;color:#fff;border-radius:980px;padding:12px 22px;font:500 15px Heebo,Arial,sans-serif;text-align:center;box-shadow:0 10px 24px rgba(0,0,0,.25);opacity:0;transform:translateY(12px);transition:opacity .2s,transform .2s;pointer-events:none;z-index:99999';
  note.textContent='זוהי תצוגה מקדימה של דף הבית. האתר המלא מוצג בהדגמה חיה.';document.body.appendChild(note);let t;
  const say=()=>{note.style.opacity=1;note.style.transform='none';clearTimeout(t);t=setTimeout(()=>{note.style.opacity=0;note.style.transform='translateY(12px)'},2600)};
  document.addEventListener('click',e=>{const el=e.target.closest('a[href],[data-add],[data-wish],[data-qv],.cart-button,button[type=submit]');if(!el)return;
    const h=el.getAttribute&&el.getAttribute('href');if(h&&(h.startsWith('#')||h.startsWith('javascript')))return;
    if(h&&!h.startsWith('/')&&!h.startsWith(location.origin))return;
    e.preventDefault();e.stopImmediatePropagation();say();},true);
  document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();say();},true);
}`;

export default async function Preview({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const T = process.env.SHOWCASE_TOKEN || '';
  if (T.length < 24 || token !== T) notFound();
  return (<><Home /><script dangerouslySetInnerHTML={{ __html: JS }} /></>);
}
