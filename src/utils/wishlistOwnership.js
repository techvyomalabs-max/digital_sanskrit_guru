/**
 * Resolves the initial wishlist state and storage ownership.
 *
 * @param {Object} params
 * @param {boolean} params.hasToken - Whether an authentication token exists
 * @param {string|null} [params.currentUserId] - The current logged-in user ID, if known
 * @param {string|null} [params.owner] - The stored wishlist owner ("guest", user ID, or null/empty)
 * @param {Array} [params.storedList] - The wishlist items retrieved from localStorage
 * @returns {{ list: Array, owner: string|null, shouldClearStorage: boolean }}
 */
// resolveInitialWishlist is shared by the wishlist and saved-for-later.
export function resolveInitialWishlist({ hasToken, currentUserId, owner, storedList }) {
  const safeList = Array.isArray(storedList) ? storedList : [];

  // Not logged in (hasToken false)
  if (!hasToken) {
    if (owner === null || owner === undefined || owner === "" || owner === "guest") {
      return { list: safeList, owner: "guest", shouldClearStorage: false };
    }
    return { list: [], owner: "guest", shouldClearStorage: true };
  }

  // Logged in with unknown currentUserId: keep storedList
  const knownUserId = currentUserId ? String(currentUserId).trim() : null;
  if (!knownUserId) {
    return { list: safeList, owner, shouldClearStorage: false };
  }

  // Logged in with a known currentUserId:
  // if owner is "guest" or null keep storedList (it will be merged by the existing login logic)
  if (owner === "guest" || owner === null || owner === undefined || owner === "") {
    return { list: safeList, owner, shouldClearStorage: false };
  }

  // if owner equals currentUserId keep storedList
  if (String(owner).trim() === knownUserId) {
    return { list: safeList, owner, shouldClearStorage: false };
  }

  // if owner is a user id different from currentUserId, return list [], owner unchanged, shouldClearStorage true
  return { list: [], owner, shouldClearStorage: true };
}
