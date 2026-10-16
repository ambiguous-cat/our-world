export const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string) {
  if (
    !path.startsWith("/") ||
    path === APP_BASE_PATH ||
    path.startsWith(`${APP_BASE_PATH}/`)
  ) {
    return path;
  }

  return `${APP_BASE_PATH}${path}`;
}
