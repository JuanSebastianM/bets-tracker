// Loads the glossary and rules content for the current locale (cached by src/data/content.js).
import { useEffect, useState } from '../../../vendor/preact.js';
import { useLocale } from '../../lib/i18n.js';
import { loadContent } from '../../data/content.js';

/**
 * @returns {{ status: 'loading' | 'ready' | 'error', content: import('../../data/content.js').Content | null, error: string | null, retry: () => void }}
 */
export function useContent() {
  const locale = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(/** @type {{ status: 'loading' | 'ready' | 'error', content: any, error: string | null }} */ ({ status: 'loading', content: null, error: null }));
  useEffect(() => {
    let alive = true;
    loadContent(locale).then(
      (content) => alive && setState({ status: 'ready', content, error: null }),
      (e) => alive && setState({ status: 'error', content: null, error: String(e?.message || e) }),
    );
    return () => {
      alive = false;
    };
  }, [locale, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
