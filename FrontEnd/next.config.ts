import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const root = dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl({
  reactStrictMode: true,
  turbopack: {
    root,
  },
});
