import { permanentRedirect } from 'next/navigation';
// legacy search URL (greentec.co.il/search/results?q=…) – the old WebSite schema pointed Google here
export default async function LegacySearch({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = (await searchParams).q || '';
  permanentRedirect(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
}
