import { createContext, useContext, useState, useCallback } from 'react'

const CommunityUnreadContext = createContext(null)

export function CommunityUnreadProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0)

  const incrementUnread = useCallback(() => {
    setUnreadCount((c) => c + 1)
  }, [])

  const resetUnread = useCallback(() => {
    setUnreadCount(0)
  }, [])

  return (
    <CommunityUnreadContext.Provider value={{ unreadCount, incrementUnread, resetUnread }}>
      {children}
    </CommunityUnreadContext.Provider>
  )
}

export function useCommunityUnread() {
  const ctx = useContext(CommunityUnreadContext)
  return ctx || { unreadCount: 0, incrementUnread: () => {}, resetUnread: () => {} }
}
