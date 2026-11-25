import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

export function useWebSocket() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    // Create socket connection
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })
    
    // Server-initiated latency probe for fair buzzer judging: ack immediately.
    newSocket.on('latency-ping', (ack) => {
      if (typeof ack === 'function') ack()
    })

    // Connection handlers
    newSocket.on('connect', () => {
      console.log('Connected to server')
      setConnected(true)
      setError(null)
    })
    
    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
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
      
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000)
    })
    
    setSocket(newSocket)
    
    // Cleanup on unmount
    return () => {
      newSocket.close()
    }
  }, [])
  
  return { socket, connected, error }
}
