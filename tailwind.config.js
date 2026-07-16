/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        field: "rgb(var(--field) / <alpha-value>)",
        moss: "rgb(var(--moss) / <alpha-value>)",
        "moss-deep": "rgb(var(--moss-deep) / <alpha-value>)",
        pin: "rgb(var(--pin) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        line: "var(--line)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(29, 36, 29, 0.05)",
        pop: "0 10px 30px -12px rgba(29, 36, 29, 0.25)",
      },
    },
  },
  plugins: [],
};
