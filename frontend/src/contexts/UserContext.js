import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchMe, updateMe } from "@/lib/userApi";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((u) => { if (!cancelled) setUser(u); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const updateUsername = useCallback(async (username) => {
    const updated = await updateMe({ username });
    setUser(updated);
    return updated;
  }, []);

  const updateCountry = useCallback(async (country) => {
    const updated = await updateMe({ country });
    setUser(updated);
    return updated;
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, error, updateUsername, updateCountry }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
