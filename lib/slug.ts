export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function uniqueSlug(base: string, exists: (candidate: string) => boolean) {
  const root = slugify(base) || "installer";
  if (!exists(root)) return root;
  for (let i = 2; i < 500; i += 1) {
    const candidate = `${root}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
