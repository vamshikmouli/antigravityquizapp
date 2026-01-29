import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

export function useWebSocket() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })
    
    newSocket.on('connect', () => {
      console.log('TV Display connected to server')
      setConnected(true)
      setError(null)
    })
    
    newSocket.on('disconnect', () => {
      console.log('TV Display disconnected from server')
      setConnected(false)
    })
    
    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err)
      setError('Failed to connect to server')
      setConnected(false)
    })
    
    newSocket.on('error', (data) => {
      console.error('Server error:', data)
      setError(data.message || 'An error occurred')
      setTimeout(() => setError(null), 5000)
    })
    
    setSocket(newSocket)
    
    return () => {
      newSocket.close()
    }
  }, [])
  
  return { socket, connected, error }
}
