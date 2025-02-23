"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { Socket, io } from "socket.io-client"

const hostName: string = "https://video-transcoder-api.onrender.com"

export type IOContext = {
  startSocket: (videoId: string) => void;
  stopSocket: () => void;
  status: string,
  messages: string[],
  setStatus: (status: string) => void;
}

const IOContext = createContext<IOContext | null>(null)
export const IOContextProvider = ({ children }: {
  children: React.ReactNode
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  const onMessageReceived = useCallback((msg: string) => {
    try {
      console.log(msg)
      const { type, status, message } = JSON.parse(msg);
      if (type === 'log-message' && message) {
        setMessages([...messages, message])
        console.log(messages);
      } else if (type === 'status-update' && status) {
        setStatus(status)
      }
    } catch (error) {

    }
  }, [messages])

  const startSocket = (videoId: string) => {
    const _socket = io(hostName);
    setSocket(_socket);
    setMessages([]);
    setStatus("");
    _socket.emit("subscribe", `logs:${videoId}`)
    _socket.on('message', onMessageReceived)
  }

  const stopSocket = () => {
    socket?.disconnect();
    socket?.off('message', onMessageReceived)
    setSocket(null);
  }

  return (
    <IOContext.Provider value={
      {
        startSocket, stopSocket, status, messages, setStatus
      }
    }>
      {children}
    </IOContext.Provider>
  )
}

export const useIOContext = () => {
  const state = useContext(IOContext);
  if (!state) throw new Error("state not defined");
  return state;
}
