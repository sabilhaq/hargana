import { getRequestConfig } from "next-intl/server";

// Bahasa Indonesia only for the MVP; a language switcher comes later.
export const defaultLocale = "id";

export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: (await import(`../../messages/${defaultLocale}.json`)).default,
}));
