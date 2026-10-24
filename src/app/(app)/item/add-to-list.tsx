"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useCore } from "../core-provider";
import { Button } from "../ui";

/** "+ Daftar belanja": one unit of the item onto the shopping list. */
export function AddToList({ itemId }: { itemId: string }) {
  const t = useTranslations("ShoppingList");
  const core = useCore();
  const [added, setAdded] = useState(false);
  return added ? (
    <p role="status" className="text-center text-sm">
      {t("added")}{" "}
      <Link href="/list" className="font-semibold text-green-700 dark:text-green-500">
        {t("view")}
      </Link>
    </p>
  ) : (
    <Button variant="secondary" onClick={() => void core.addToList(itemId).then(() => setAdded(true))}>
      + {t("title")}
    </Button>
  );
}
