
// Minimal bootstrap for mobile/web if actual bundle isn't present.
// This placeholder will show a simple message if the React build isn't bundled.
const root = document.getElementById('root');
if (root) {
  root.innerHTML = '<div style="padding:24px;color:white;font-family:sans-serif;"><h1>Tehranak CRM (Placeholder)</h1><p>If your app bundle is not included, replace this index.tsx with your built bundle or adjust build pipeline.</p></div>';
}
