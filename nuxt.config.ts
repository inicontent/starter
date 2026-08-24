import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const useLocalInicontent = existsSync(
	resolve(dirname(fileURLToPath(import.meta.url)), "../inicontent"),
);

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: 'latest',
  extends: [
    useLocalInicontent
      ? resolve(dirname(fileURLToPath(import.meta.url)), "../inicontent")
      : ["github:inicontent/inicontent", { install: true }],
  ],
})
