import { createContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../hooks/useAuth";

const DeliveryLocationContext = createContext(null);
const STORAGE_KEY = "addresses";

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

function readStoredAddresses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredAddress) : [];
  } catch {
    return [];
  }
}

export function DeliveryLocationProvider({ children }) {
  const { token } = useAuth();
  const [addresses, setAddresses] = useState(() => readStoredAddresses());
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const initial = readStoredAddresses();
    if (initial.length === 0) return null;
    const defaultIndex = initial.findIndex((item) => item?.isDefault);
    return defaultIndex >= 0 ? defaultIndex : 0;
  });

  useEffect(() => {
    if (token) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses, token]);

  useEffect(() => {
    let active = true;

    const getDefaultIndex = (list) => {
      if (!Array.isArray(list) || list.length === 0) return null;
      const index = list.findIndex((item) => item?.isDefault);
      return index >= 0 ? index : 0;
    };

    const migrateLocalAddressesIfNeeded = async (remoteAddresses) => {
      const localAddresses = readStoredAddresses();
      if (!Array.isArray(remoteAddresses) || remoteAddresses.length > 0 || localAddresses.length === 0) {
        return remoteAddresses;
      }

      try {
        const res = await axios.put(
          "/api/auth/addresses",
          { addresses: localAddresses },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return Array.isArray(res.data?.addresses) ? res.data.addresses.map(normalizeStoredAddress) : localAddresses;
      } catch {
        return localAddresses;
      }
    };

    const loadAddresses = async () => {
      if (!token) {
        const localAddresses = readStoredAddresses();
        if (!active) return;
        setAddresses(localAddresses);
        setSelectedIndex(getDefaultIndex(localAddresses));
        return;
      }

      try {
        const res = await axios.get("/api/auth/addresses", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const remoteAddresses = Array.isArray(res.data?.addresses)
          ? res.data.addresses.map(normalizeStoredAddress)
          : [];
        const nextAddresses = await migrateLocalAddressesIfNeeded(remoteAddresses);
        if (!active) return;
        setAddresses(nextAddresses);
        setSelectedIndex(getDefaultIndex(nextAddresses));
      } catch {
        const localAddresses = readStoredAddresses();
        if (!active) return;
        setAddresses(localAddresses);
        setSelectedIndex(getDefaultIndex(localAddresses));
      }
    };

    loadAddresses();

    return () => {
      active = false;
    };
  }, [token]);

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
    if (!token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAddresses));
      return;
    }

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

      return current.map((item, itemIndex) => {
        if (itemIndex === index) return nextAddress;
        if (nextAddress.isDefault) return { ...item, isDefault: false };
        return item;
      });

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
  };

  const setDefaultAddress = (index) => {
    setAddresses((current) => {
      const next = current.map((item, itemIndex) => ({
        ...item,
        isDefault: itemIndex === index
      }));
      void persistAddresses(next);
      return next;
    });
    setSelectedIndex(index);
  };

  const selectedAddress = useMemo(() => {
    return selectedIndex === null ? null : addresses[selectedIndex] || null;
  }, [addresses, selectedIndex]);

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
