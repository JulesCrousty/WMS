let onRouteChange;

function normalize(hash) {
  if (!hash) return "";
  return hash.replace(/^#/, "");
}

function parseHash(hash) {
  const value = normalize(hash) || "/hub";
  if (value === "/login") {
    return { type: "login" };
  }
  if (value === "/hub" || value === "hub") {
    return { type: "hub" };
  }
  if (value.startsWith("/app/")) {
    const [, , moduleId, section] = value.split("/");
    return {
      type: "module",
      moduleId,
      section: section || null
    };
  }
  return { type: "hub" };
}

export function initRouter(callback) {
  onRouteChange = callback;
  window.addEventListener("hashchange", () => {
    onRouteChange?.(parseHash(window.location.hash));
  });
  callback(parseHash(window.location.hash));
}

export function navigateTo(path) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === target) {
    onRouteChange?.(parseHash(window.location.hash));
  } else {
    window.location.hash = target;
  }
}

export function getCurrentRoute() {
  return parseHash(window.location.hash);
}
