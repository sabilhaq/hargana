"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { Category } from "@/core";
import { useCore } from "../../core-provider";
import { Button, Field, FormActions, FormError, inputClass, List, Row, Screen, Sheet, useCoreData, useSave } from "../../ui";

type Editing = Category | "new" | null;

export default function CategoriesPage() {
  const t = useTranslations("Categories");
  const [categories, reload] = useCoreData((c) => c.listCategories());
  const [editing, setEditing] = useState<Editing>(null);
  const nextOrder = ((categories?.at(-1)?.sortOrder ?? 0) + 10);

  return (
    <Screen title={t("title")} back="/settings">
      <List>
        {categories?.map((category) => (
          <Row key={category.id} onClick={() => setEditing(category)} title={category.name} />
        ))}
      </List>
      <Button variant="secondary" onClick={() => setEditing("new")}>
        {t("add")}
      </Button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("add") : t("edit")}>
        {editing && (
          <CategoryForm
            category={editing === "new" ? undefined : editing}
            defaultOrder={nextOrder}
            onDone={() => {
              setEditing(null);
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Screen>
  );
}

function CategoryForm({
  category,
  defaultOrder,
  onDone,
  onCancel,
}: {
  category?: Category;
  defaultOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Categories");
  const core = useCore();
  const { saving, error, run } = useSave();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await run(() =>
      core.saveCategory({
        id: category?.id,
        name: String(form.get("name")),
        sortOrder: Number(form.get("sortOrder")),
      }),
    );
    if (saved) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t("name")}>
        <input name="name" required defaultValue={category?.name} className={inputClass} />
      </Field>
      <Field label={t("sortOrder")}>
        <input name="sortOrder" type="number" required defaultValue={category?.sortOrder ?? defaultOrder} className={inputClass} />
      </Field>
      <FormError error={error} />
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}
