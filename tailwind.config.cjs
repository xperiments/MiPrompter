/** @type {import('tailwindcss').Config} */
module.exports = {
  // Ensure presenter entry + app.html are scanned and preserve the
  // utility classes the Presenter relies on (safelist as safety-net).
  content: ["./index.html", "./app.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,.35)",
      },
    },
  },
  // Some Presenter classes are generated dynamically or live only in the
  // presenter bundle — keep them with a safelist so production builds
  // retain the utilities exactly as in the reference app.
  safelist: [
    // exact
    'no-scrollbar', 'mirror-mode', 'screen-rotated', 'show-stops', 'smooth-animations', 'recording-pulse', 'script-word', 'stop-marker', 'skipped-word', 'line-break', 'current-word', 'presenter-button', 'presenter-controls',
    // patterns
    { pattern: /^max-w-/ },
    { pattern: /^leading-/ },
    { pattern: /^text-/ },
    { pattern: /^bg-/ },
    { pattern: /^border-/ },
    { pattern: /^translate-/ },
    { pattern: /^px-/ },
    { pattern: /^py-/ },
    { pattern: /^mx-/ },
    { pattern: /^-translate-/ },
    { pattern: /^z-/ },
    { pattern: /^p-/ },
  ],
  plugins: [],
};
