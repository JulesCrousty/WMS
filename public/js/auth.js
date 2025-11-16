const TOKEN_KEY = "erp_token";
const USER_KEY = "erp_user";

export function getStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token || !rawUser) {
    return null;
  }
  try {
    return { token, user: JSON.parse(rawUser) };
  } catch (err) {
    clearSession();
    return null;
  }
}

export function saveSession({ token, user }) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export async function login(username, password) {
  const response = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Impossible de se connecter" }));
    throw new Error(payload.error || "Identifiants invalides");
  }
  return response.json();
}

export async function fetchCurrentUser() {
  const token = getToken();
  if (!token) {
    throw new Error("Session absente");
  }
  const response = await fetch("/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error("Session expirée");
  }
  return response.json();
}

export function logout() {
  clearSession();
}
