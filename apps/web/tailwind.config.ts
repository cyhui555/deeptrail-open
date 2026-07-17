import type { Config } from 'tailwindcss';

/**
 * “蓝色交互层 + 暖纸张底图”设计令牌。
 *
 * 历史页面仍引用 blue / indigo / purple 等语义色，因此统一映射到矿物蓝。
 * 这样能保持全站交互语言一致，同时不触碰业务组件的数据与流程。
 */
const mineralBlue = {
  50: '#f3f8fc',
  100: '#e2eff9',
  200: '#c4def0',
  300: '#98c2e1',
  400: '#659fc9',
  500: '#3e7faf',
  600: '#2b6595',
  700: '#25527a',
  800: '#234665',
  900: '#203b53',
  950: '#152637',
};

const warmGray = {
  50: '#fcf9f4',
  100: '#f4eee5',
  200: '#e6dacb',
  300: '#d1c1ae',
  400: '#a18e78',
  500: '#776754',
  600: '#5d4f40',
  700: '#463a2f',
  800: '#302820',
  900: '#211c17',
  950: '#17130f',
};

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: mineralBlue,
        blue: mineralBlue,
        cyan: mineralBlue,
        indigo: mineralBlue,
        purple: mineralBlue,
        violet: mineralBlue,
        rose: mineralBlue,
        pink: mineralBlue,
        gray: warmGray,
        slate: warmGray,
        surface: {
          DEFAULT: '#fcf8f0',
          subtle: '#f3eadc',
          muted: '#eadcc8',
        },
        border: '#ddcdb8',
        text: {
          DEFAULT: '#211c17',
          muted: '#776754',
          subtle: '#a18e78',
        },
        success: {
          50: '#f1f7ef',
          100: '#dfeddc',
          600: '#4d7a49',
          800: '#345432',
        },
        warning: {
          50: '#fff8e8',
          100: '#f8e9bc',
          600: '#9b6b21',
          800: '#6f4b17',
        },
        danger: {
          50: '#fff3f0',
          100: '#f8dcd5',
          600: '#b34235',
          800: '#7f3028',
        },
      },
      boxShadow: {
        card: '0 1px 1px rgba(63,40,23,.06), 0 14px 36px -24px rgba(93,54,28,.3)',
        'card-hover': '0 24px 54px -28px rgba(37,82,122,.4)',
        popover: '0 30px 80px -34px rgba(67,42,24,.42)',
      },
      borderRadius: {
        card: '1rem',
        pill: '9999px',
      },
    },
  },
  plugins: [],
};

export default config;
