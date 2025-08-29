import React, { createContext, useContext, useMemo, useState } from 'react';

const ScrollLockContext = createContext({ 
  locked: false, 
  setLocked: () => {} 
});

export function ScrollLockProvider({ children }) {
  const [locked, setLocked] = useState(false);
  const value = useMemo(() => ({ locked, setLocked }), [locked]);
  return (
    <ScrollLockContext.Provider value={value}>
      {children}
    </ScrollLockContext.Provider>
  );
}

export const useScrollLock = () => useContext(ScrollLockContext);