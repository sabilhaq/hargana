import type { Category, Region } from "./types";

// Fixed ids so every device seeds the same records and sync never duplicates them.
export const GARUT_REGION_ID = "4a518048-414d-497c-bc12-71c6dae385c7";

export const SEEDED_AT = "2026-01-01T00:00:00.000Z";

export const seedRegions: Region[] = [
  {
    id: GARUT_REGION_ID,
    name: "Kabupaten Garut",
    countryCode: "ID",
    currency: "IDR",
    locale: "id-ID",
    staleDaysMarket: 7,
    staleDaysSupermarket: 30,
    updatedAt: SEEDED_AT,
  },
];

const categoryIds = [
  "ddbf9231-b67a-44c4-b80c-d0e797654d4e",
  "9275c298-d984-4baa-8e21-31501b4ba668",
  "9a683bf1-2946-42c4-9768-2d05bfe6fb67",
  "aa33d481-efa3-4d77-b764-90f4c970aaff",
  "40e5e395-d639-4ecc-853e-697f55847cad",
  "a510f07a-cd23-41f9-be48-3b984081abc2",
  "6e45e175-23ea-4f63-af95-fd50bd127af5",
  "4a78d1e8-495f-4010-89e8-ff28a3626f1b",
  "1962bafa-d00a-46f1-8f10-ba25a7e5e381",
  "71bf80f3-629d-43aa-b8c7-bf2606a976b1",
  "c9d6ab86-0d38-4f54-80ce-f0983c3a173e",
];

const categoryNames = [
  "Beras",
  "Telur",
  "Sayur",
  "Buah",
  "Bumbu",
  "Minyak",
  "Daging & Ikan",
  "Gula & Tepung",
  "Minuman",
  "Camilan",
  "Kebutuhan Rumah",
];

export const seedCategories: Category[] = categoryNames.map((name, i) => ({
  id: categoryIds[i],
  name,
  sortOrder: (i + 1) * 10,
  updatedAt: SEEDED_AT,
}));
