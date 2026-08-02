type CategorizedItem = Readonly<{ category?: string | null }>;

export function categoryNamesFromProducts(products: readonly CategorizedItem[]): string[] {
  return uniqueCategoryNames(products.map((product) => categoryName(product.category)));
}

export function categoryName(value: string | null | undefined): string {
  return value?.trim() || "อื่น ๆ";
}

export function parseCategoryOrder(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? uniqueCategoryNames(parsed.filter((item): item is string => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

export function orderCategoryNames(categories: readonly string[], savedOrder: readonly string[]): string[] {
  const current = uniqueCategoryNames(categories);
  const available = new Set(current);
  const ordered = uniqueCategoryNames(savedOrder).filter((category) => available.has(category));
  const orderedSet = new Set(ordered);
  return [...ordered, ...current.filter((category) => !orderedSet.has(category))];
}

export function serializeCategoryOrder(categories: readonly string[]): string {
  return JSON.stringify(uniqueCategoryNames(categories));
}

function uniqueCategoryNames(values: readonly string[]): string[] {
  const names = new Set<string>();
  for (const value of values) names.add(categoryName(value));
  return [...names];
}
