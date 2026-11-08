// First-visit guided tours, one per customer page.
//
// Each tour is a short list of steps. A step points at one part of the page using
// CSS selectors (the first one that is visible on screen wins), so the same step
// works on desktop and phone. Steps whose element is not on the page are skipped,
// and so are steps whose `skipIfVisible` element is on screen.
//
// A tour shows once per browser. Finishing or closing it marks it as seen.
// "Don't show tips again" turns off every tour. The footer link replays the
// tour for the page you are on.

// Bump this when the tours change enough that returning visitors should see them again.
export const TOUR_VERSION = 1;

const SEEN_KEY = "dsg_tours_seen";
const OFF_KEY = "dsg_tours_off";
export const START_TOUR_EVENT = "dsg:start-page-tour";

export const PAGE_TOURS = {
  home: {
    steps: [
      {
        title: "Welcome to Digital Sanskrit Guru",
        description:
          "Books, e-books, courses and study material for learning Sanskrit. Here is a quick look around — it takes about 30 seconds."
      },
      {
        selectors: [".navbar-search-outer"],
        title: "Search anything",
        description:
          "Search by title, topic or author. You can type in English or Sanskrit (Devanagari)."
      },
      {
        selectors: [".navbar-collection-menu-btn"],
        title: "Browse by category",
        description: "Open the full list of categories and devices here."
      },
      {
        selectors: [".navbar-location-btn"],
        title: "Your delivery location",
        description: "Set your address or PIN code to see delivery dates and charges for printed books."
      },
      {
        selectors: [".navbar-account"],
        title: "Your account",
        description: "Sign in to see your orders, saved addresses and your digital library."
      },
      {
        selectors: [".navbar-cart"],
        title: "Your cart",
        description: "Items you add appear here. You can check out whenever you are ready."
      },
      {
        // Phones only: the account link is hidden there, so point at the menu instead.
        selectors: [".navbar-menu-toggle"],
        skipIfVisible: [".navbar-account"],
        title: "More pages",
        description: "Open the menu for your account, My Library, Wishlist, FAQs and more."
      },
      {
        selectors: [".chat-launcher-wrap", ".whatsapp-float-button"],
        title: "Need help?",
        description: "Ask us a question any time from here."
      }
    ]
  },

  product: {
    requires: [".product-right"],
    steps: [
      {
        selectors: [".product-format-picker"],
        title: "Choose a format",
        description:
          "Many titles come in more than one format — Paperback, Kindle, e-book or Web version. Pick the one you want; the price and details change with it."
      },
      {
        selectors: [".buy-box"],
        title: "Add to cart or buy now",
        description:
          "Add to Cart lets you keep shopping. Buy Now takes you straight to checkout with just this item."
      },
      {
        selectors: [".product-coupon-offers"],
        title: "Offers",
        description: "Coupons that work on this product. Tap a code to copy it."
      },
      {
        selectors: [".product-image-actions"],
        title: "Save or share",
        description: "Use the heart to save it to your Wishlist, or share it with a friend."
      },
      {
        selectors: [".product-bulk-quote-section"],
        title: "Buying for a class?",
        description: "Schools and institutions can ask for a bulk quote here."
      },
      {
        selectors: [".product-details-section"],
        title: "Full details",
        description: "Scroll down for the description, contents and other product details."
      }
    ]
  },

  collection: {
    requires: [".collection-grid"],
    steps: [
      {
        selectors: [".collection-sidebar-card", ".collection-mobile-filter-btn"],
        title: "Filter",
        description: "Narrow the list by category or device."
      },
      {
        selectors: [".collection-sort-box", ".collection-sort-box-mobile"],
        title: "Sort",
        description: "Sort by price, latest, rating or name."
      },
      {
        selectors: [".collection-grid > :first-child"],
        title: "Open a product",
        description: "Tap any item to see its formats, price and details."
      }
    ]
  },

  search: {
    requires: [".search-results-grid", ".search-empty-state-wrap"],
    steps: [
      {
        selectors: [".search-results-sidebar", ".search-results-category-chips"],
        title: "Filter your results",
        description: "Pick a category to see only matching items."
      },
      {
        selectors: [".search-results-sort"],
        title: "Sort",
        description: "Change the order of the results."
      },
      {
        selectors: [".search-results-grid > :first-child"],
        title: "Open a result",
        description: "Tap an item to see its formats and details."
      },
      {
        selectors: [".search-empty-tips"],
        title: "Nothing found?",
        description: "Try a shorter word, a different spelling, or search in Devanagari."
      }
    ]
  },

  cart: {
    requires: [".cart-items"],
    steps: [
      {
        selectors: [".cart-items .cart-item"],
        title: "Your items",
        description: "Change the quantity or remove an item here."
      },
      {
        selectors: [".cart-summary"],
        title: "Order summary",
        description: "Your total, including any delivery charges, before you pay."
      },
      {
        selectors: [".checkout-btn-wrap", ".checkout-link"],
        title: "Check out",
        description: "When you are ready, continue to choose your address and pay."
      }
    ]
  },

  checkout: {
    requires: [".checkout-container"],
    steps: [
      {
        selectors: [".checkout-main .checkout-step-card"],
        title: "Delivery address",
        description: "Choose where to send printed books, or add a new address. Digital items need no address."
      },
      {
        selectors: [".checkout-coupons-main-card"],
        title: "Coupons",
        description: "Apply an available coupon to save on this order."
      },
      {
        selectors: [".checkout-gift-card"],
        title: "Sending a gift?",
        description: "Turn this on to send the order to someone else with a note."
      },
      {
        selectors: [".pay-now-btn"],
        title: "Pay securely",
        description: "Check your total, then pay securely. Your order appears in My Orders once payment is done."
      }
    ]
  },

  wishlist: {
    requires: [".wishlist-list-items"],
    steps: [
      {
        selectors: [".wishlist-item-row"],
        title: "Saved for later",
        description: "Everything you hearted on a product page is kept here."
      },
      {
        selectors: [".wishlist-action-buttons"],
        title: "Move to cart",
        description: "Add an item to your cart, or remove it from the list."
      }
    ]
  },

  account: {
    requires: [".my-account-header"],
    steps: [
      {
        selectors: [".my-account-tile-grid"],
        title: "Shortcuts",
        description: "Jump to your orders, digital library, wishlist and more."
      },
      {
        selectors: ["#account-details"],
        title: "Your details",
        description: "Update your name, phone, email and password."
      },
      {
        selectors: ["#manage-address"],
        title: "Saved addresses",
        description: "Add, edit or choose a default delivery address."
      }
    ]
  },

  orders: {
    requires: [".my-orders-page"],
    steps: [
      {
        selectors: [".my-orders-filters"],
        title: "Find an order",
        description: "Switch between all orders, ones that need your action, and completed ones."
      },
      {
        selectors: [".my-order-card"],
        title: "Order details",
        description: "See the items, status, invoice and courier tracking for each order."
      },
      {
        selectors: [".my-order-digital-box"],
        title: "Digital items",
        description: "Access links for e-books and courses in this order. They are also in My Library."
      }
    ]
  },

  library: {
    requires: [".my-library-container"],
    steps: [
      {
        selectors: [".my-library-grid", ".my-library-empty-card"],
        title: "Your digital library",
        description: "E-books, web versions and courses you buy appear here, ready to open."
      },
      {
        selectors: [".my-library-search-box"],
        title: "Search your library",
        description: "Quickly find a title you own."
      },
      {
        selectors: [".my-library-redeem-btn"],
        title: "Got a gift code?",
        description: "Redeem a gift pass someone sent you."
      }
    ]
  },

  redeem: {
    requires: [".redeem-form"],
    steps: [
      {
        selectors: [".redeem-form"],
        title: "Redeem a gift",
        description: "Enter the code from your gift email. The item will be added to your library."
      }
    ]
  },

  faq: {
    requires: [".faq-flow-page"],
    steps: [
      {
        selectors: [".faq-categories-grid"],
        title: "Pick a topic",
        description: "Choose what your question is about to see the answers for that topic."
      },
      {
        selectors: [".faq-questions-pill-selector"],
        title: "Answers",
        description: "Open a question to read the answer."
      },
      {
        selectors: [".faq-hero-policy-bar"],
        title: "Policies",
        description: "Our shipping, refund and other policies are linked here."
      }
    ]
  },

  contact: {
    requires: [".contact-page"],
    steps: [
      {
        selectors: [".contact-methods-grid"],
        title: "Reach us",
        description: "Call us or message us on WhatsApp — whichever is easiest for you."
      },
      {
        selectors: [".inquiry-grid"],
        title: "Common requests",
        description: "Product questions, bulk orders and gifting."
      }
    ]
  }
};

// Which tour belongs to a path. Pages not listed (admin, login and sign-up,
// password reset, guest payment links, policy text pages) have no tour.
export function getTourKeyForPath(pathname = "") {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path.startsWith("/product/")) return "product";
  const exact = {
    "/collection": "collection",
    "/search": "search",
    "/cart": "cart",
    "/checkout": "checkout",
    "/wishlist": "wishlist",
    "/account": "account",
    "/my-orders": "orders",
    "/my-library": "library",
    "/redeem-gift": "redeem",
    "/faq": "faq",
    "/contact": "contact"
  };
  return exact[path] || null;
}

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readSeen() {
  try {
    const parsed = JSON.parse(storage()?.getItem(SEEN_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function toursTurnedOff() {
  try {
    return storage()?.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function turnOffTours() {
  try {
    storage()?.setItem(OFF_KEY, "1");
  } catch {
    // Storage blocked: the tour simply shows again next visit.
  }
}

export function hasSeenTour(key) {
  return Number(readSeen()[key]) >= TOUR_VERSION;
}

export function markTourSeen(key) {
  try {
    const seen = readSeen();
    seen[key] = TOUR_VERSION;
    storage()?.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Storage blocked: nothing else to do.
  }
}

export function shouldAutoStartTour(key) {
  return Boolean(key && PAGE_TOURS[key]) && !toursTurnedOff() && !hasSeenTour(key);
}

// Ask the tour component to (re)start the tour for the current page.
export function requestPageTour() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));
}
