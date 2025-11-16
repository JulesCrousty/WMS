import { getToken, clearSession } from "./auth.js";

async function request(method, url, payload) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined
  });
  if (response.status === 401 || response.status === 403) {
    clearSession();
    throw new Error("Session expirée");
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Erreur API");
  }
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

export function apiGet(url) {
  return request("GET", url);
}

export function apiPost(url, payload) {
  return request("POST", url, payload);
}

export function apiPut(url, payload) {
  return request("PUT", url, payload);
}

export function apiPatch(url, payload) {
  return request("PATCH", url, payload);
}

export function apiDelete(url) {
  return request("DELETE", url);
}

export async function safeApiGet(url, fallback = []) {
  try {
    return await apiGet(url);
  } catch (err) {
    console.warn("API", url, err.message);
    return fallback;
  }
}
