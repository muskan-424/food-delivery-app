const API_PORT = process.env.PLAYWRIGHT_API_PORT || "4000";
export const API_BASE = `http://127.0.0.1:${API_PORT}`;

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
}

export async function registerUser(request, { email, name = "E2E User", password = "SmokeTest1!" } = {}) {
  const res = await request.post(`${API_BASE}/api/user/register`, {
    data: { name, email, password },
  });
  if (!res.ok()) {
    throw new Error(`register failed ${res.status()}: ${await res.text()}`);
  }
  const json = await res.json();
  const token = json.token || json.accessToken || json.data?.token || json.data?.accessToken;
  if (!token) throw new Error("register: no token in response");
  return { email, password, token, json };
}

export async function loginUser(request, { email, password }) {
  const res = await request.post(`${API_BASE}/api/user/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`login failed ${res.status()}: ${await res.text()}`);
  }
  const json = await res.json();
  const token = json.token || json.accessToken || json.data?.token || json.data?.accessToken;
  if (!token) throw new Error("login: no token in response");
  return { email, token, json };
}

export async function seedBrowserSession(page, token) {
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("token", t);
  }, token);
  await page.reload();
}
