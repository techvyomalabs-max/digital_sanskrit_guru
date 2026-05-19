import { createContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";

const DeliveryLocationContext = createContext(null);
const GUEST_STORAGE_KEY = "addresses:guest";
const SELECTED_DELIVERY_COUNTRY_KEY = "selectedDeliveryCountry";
const SELECTED_ADDRESS_KEY_PREFIX = "selectedAddress:";

function normalizeStoredAddress(item) {
  return {
    label: ["Home", "Work", "Other"].includes(String(item?.label || "").trim()) ? String(item.label).trim() : "Home",
    name: String(item?.name || "").trim(),
    phone: String(item?.phone || "").trim(),
    address: String(item?.address || "").trim(),
    landmark: String(item?.landmark || "").trim(),
    city: String(item?.city || "").trim(),
    state: String(item?.state || "").trim(),
    pincode: String(item?.pincode || "").trim(),
    country: String(item?.country || "").trim(),
    latitude:
      item?.latitude === null || item?.latitude === undefined || item?.latitude === ""
        ? null
        : Number(item.latitude),
    longitude:
      item?.longitude === null || item?.longitude === undefined || item?.longitude === ""
        ? null
        : Number(item.longitude),
    isDefault: Boolean(item?.isDefault)
  };
}

function getUserStorageKey(userId) {
  return `addresses:${String(userId || "").trim()}`;
}

function getSelectedAddressStorageKey(userId) {
  const suffix = String(userId || "").trim() || "guest";
  return `${SELECTED_ADDRESS_KEY_PREFIX}${suffix}`;
}

function buildAddressSelectionKey(address) {
  if (!address) return "";
  return [
    String(address?.name || "").trim().toLowerCase(),
    String(address?.phone || "").trim().toLowerCase(),
    String(address?.address || "").trim().toLowerCase(),
    String(address?.city || "").trim().toLowerCase(),
    String(address?.state || "").trim().toLowerCase(),
    String(address?.pincode || "").trim().toLowerCase(),
    String(address?.country || "").trim().toLowerCase()
  ].join("|");
}

function readSelectedAddressKey(storageKey) {
  if (typeof localStorage === "undefined") return "";
  return String(localStorage.getItem(storageKey) || "").trim();
}

function writeSelectedAddressKey(storageKey, address) {
  if (typeof localStorage === "undefined") return;
  const selectionKey = buildAddressSelectionKey(address);
  if (selectionKey) {
    localStorage.setItem(storageKey, selectionKey);
    return;
  }
  localStorage.removeItem(storageKey);
}

function readStoredAddresses(storageKey) {
  try {
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredAddress) : [];
  } catch {
    return [];
  }
}

function writeStoredAddresses(storageKey, addresses) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(addresses));
}

function syncSelectedDeliveryCountry(address) {
  if (typeof localStorage === "undefined") return;

  const country = String(address?.country || "").trim();
  if (country) {
    localStorage.setItem(SELECTED_DELIVERY_COUNTRY_KEY, country);
    return;
  }

  localStorage.removeItem(SELECTED_DELIVERY_COUNTRY_KEY);
}

export function DeliveryLocationProvider({ children }) {
  const { token, user } = useAuth();
  const selectedAddressStorageKey = getSelectedAddressStorageKey(user?._id);
  const [addresses, setAddresses] = useState(() => readStoredAddresses(GUEST_STORAGE_KEY));
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const initial = readStoredAddresses(GUEST_STORAGE_KEY);
    if (initial.length === 0) return null;
    const selectedKey = readSelectedAddressKey(getSelectedAddressStorageKey(""));
    const selectedMatchIndex = initial.findIndex((item) => buildAddressSelectionKey(item) === selectedKey);
    if (selectedMatchIndex >= 0) return selectedMatchIndex;
    const defaultIndex = initial.findIndex((item) => item?.isDefault);
    return defaultIndex >= 0 ? defaultIndex : 0;
  });

  useEffect(() => {
    let active = true;

    const getDefaultIndex = (list, storageKey) => {
      if (!Array.isArray(list) || list.length === 0) return null;
      const selectedKey = readSelectedAddressKey(storageKey);
      const selectedMatchIndex = list.findIndex((item) => buildAddressSelectionKey(item) === selectedKey);
      if (selectedMatchIndex >= 0) return selectedMatchIndex;
      const index = list.findIndex((item) => item?.isDefault);
      return index >= 0 ? index : 0;
    };

    const loadAddresses = async () => {
      setIsLoadingAddresses(true);
      if (!token || !user?._id) {
        const localAddresses = readStoredAddresses(GUEST_STORAGE_KEY);
        if (!active) return;
        setAddresses(localAddresses);
        setSelectedIndex(getDefaultIndex(localAddresses, getSelectedAddressStorageKey("")));
        setIsLoadingAddresses(false);
        return;
      }

      const userStorageKey = getUserStorageKey(user._id);
      const selectedStorageKey = getSelectedAddressStorageKey(user._id);

      try {
        const res = await axios.get("/api/auth/addresses", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const nextAddresses = Array.isArray(res.data?.addresses)
          ? res.data.addresses.map(normalizeStoredAddress)
          : [];
        writeStoredAddresses(userStorageKey, nextAddresses);
        if (!active) return;
        setAddresses(nextAddresses);
        setSelectedIndex(getDefaultIndex(nextAddresses, selectedStorageKey));
      } catch {
        const localAddresses = readStoredAddresses(userStorageKey);
        if (!active) return;
        setAddresses(localAddresses);
        setSelectedIndex(getDefaultIndex(localAddresses, selectedStorageKey));
      } finally {
        if (!active) return;
        setIsLoadingAddresses(false);
      }
    };

    loadAddresses();

    return () => {
      active = false;
    };
  }, [token, user?._id]);

  useEffect(() => {
    if (addresses.length === 0) {
      setSelectedIndex(null);
      return;
    }

    if (selectedIndex === null || selectedIndex >= addresses.length) {
      const defaultIndex = addresses.findIndex((item) => item?.isDefault);
      setSelectedIndex(defaultIndex >= 0 ? defaultIndex : 0);
    }
  }, [addresses, selectedIndex]);

  const persistAddresses = async (nextAddresses) => {
    if (!token || !user?._id) {
      writeStoredAddresses(GUEST_STORAGE_KEY, nextAddresses);
      return;
    }

    writeStoredAddresses(getUserStorageKey(user._id), nextAddresses);

    try {
      await axios.put(
        "/api/auth/addresses",
        { addresses: nextAddresses },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      // Keep optimistic UI updates even if sync fails briefly.
    }
  };

  const addAddress = (payload) => {
    const nextAddress = normalizeStoredAddress({
      ...payload,
      isDefault: addresses.length === 0 || Boolean(payload?.isDefault)
    });

    const nextAddresses = nextAddress.isDefault
      ? [...addresses.map((item) => ({ ...item, isDefault: false })), nextAddress]
      : [...addresses, nextAddress];

    setAddresses(nextAddresses);
    setSelectedIndex(nextAddresses.length - 1);
    syncSelectedDeliveryCountry(nextAddress);
    writeSelectedAddressKey(selectedAddressStorageKey, nextAddress);
    void persistAddresses(nextAddresses);
  };

  const updateAddress = (index, payload) => {
    setAddresses((current) => {
      const existing = current[index];
      if (!existing) return current;

      const nextAddress = normalizeStoredAddress({
        ...existing,
        ...payload,
        isDefault: payload?.isDefault ?? existing.isDefault
      });

      const next = current.map((item, itemIndex) => {
        if (itemIndex === index) return nextAddress;
        if (nextAddress.isDefault) return { ...item, isDefault: false };
        return item;
      });
      const nextSelectedAddress = (selectedIndex === index ? nextAddress : next[selectedIndex]) || nextAddress;
      syncSelectedDeliveryCountry(nextSelectedAddress || null);
      writeSelectedAddressKey(selectedAddressStorageKey, nextSelectedAddress || null);
      void persistAddresses(next);
      return next;
    });
    setSelectedIndex(index);
  };

  const removeAddress = (index) => {
    setAddresses((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (next.length > 0 && !next.some((item) => item.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      const nextSelectedIndex =
        selectedIndex === null ? null : selectedIndex === index ? 0 : selectedIndex > index ? selectedIndex - 1 : selectedIndex;
      const nextSelectedAddress = nextSelectedIndex === null ? null : next[nextSelectedIndex] || null;
      syncSelectedDeliveryCountry(nextSelectedAddress);
      writeSelectedAddressKey(selectedAddressStorageKey, nextSelectedAddress);
      void persistAddresses(next);
      return next;
    });

    setSelectedIndex((currentSelected) => {
      if (currentSelected === null) return null;
      if (currentSelected === index) return 0;
      if (currentSelected > index) return currentSelected - 1;
      return currentSelected;
    });
  };

  const selectAddress = (index) => {
    setSelectedIndex(index);
    const nextSelectedAddress = addresses[index] || null;
    syncSelectedDeliveryCountry(nextSelectedAddress);
    writeSelectedAddressKey(selectedAddressStorageKey, nextSelectedAddress);
  };

  const setDefaultAddress = (index) => {
    setAddresses((current) => {
      const next = current.map((item, itemIndex) => ({
        ...item,
        isDefault: itemIndex === index
      }));
      syncSelectedDeliveryCountry(next[index] || null);
      writeSelectedAddressKey(selectedAddressStorageKey, next[index] || null);
      void persistAddresses(next);
      return next;
    });
    setSelectedIndex(index);
  };

  const selectedAddress = useMemo(() => {
    return selectedIndex === null ? null : addresses[selectedIndex] || null;
  }, [addresses, selectedIndex]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (isLoadingAddresses) return;

    const country = String(selectedAddress?.country || "").trim();
    if (country) {
      localStorage.setItem(SELECTED_DELIVERY_COUNTRY_KEY, country);
      writeSelectedAddressKey(selectedAddressStorageKey, selectedAddress);
      return;
    }

    localStorage.removeItem(SELECTED_DELIVERY_COUNTRY_KEY);
    writeSelectedAddressKey(selectedAddressStorageKey, null);
  }, [isLoadingAddresses, selectedAddress, selectedAddressStorageKey]);

  return (
    <DeliveryLocationContext.Provider
      value={{
        addresses,
        selectedIndex,
        selectedAddress,
        addAddress,
        updateAddress,
        removeAddress,
        selectAddress,
        setDefaultAddress
      }}
    >
      {children}
    </DeliveryLocationContext.Provider>
  );
}

export { DeliveryLocationContext };
