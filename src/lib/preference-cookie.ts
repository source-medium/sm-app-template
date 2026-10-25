/** A per-browser preference for every path, Secure whenever the page is. A zero `maxAge` removes it. */
export function setPreferenceCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
