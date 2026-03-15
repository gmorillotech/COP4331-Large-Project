const app_name = "167.71.81.89"; // eventually change to domain

export function buildPath(route: string): string {
  if (import.meta.env.MODE !== "development") {
    return `http://${app_name}:5050/${route}`;
  }

  return `http://127.0.0.1:5050/${route}`;
}