import { useEffect } from 'react'
import { useSocketStore } from '../stores/socketStore'

/**
 * useSocket — subscribe to a socket event with automatic cleanup.
 *
 * Usage:
 *   useSocket('task:updated', (data) => { ... })
 *   useSocket('worker:location', handleLocation, [taskId]) // re-subscribe when deps change
 */
export function useSocket<T = unknown>(
  event:    string,
  handler:  (data: T) => void,
  deps:     unknown[] = [],
): void {
  const socket = useSocketStore(s => s.socket)

  useEffect(() => {
    if (!socket) return
    socket.on(event, handler as (...args: unknown[]) => void)
    return () => {
      socket.off(event, handler as (...args: unknown[]) => void)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, event, ...deps])
}

/**
 * useJoinTaskRoom — join a socket task room on mount, leave on unmount.
 */
export function useJoinTaskRoom(taskId: string | null | undefined): void {
  const socket = useSocketStore(s => s.socket)

  useEffect(() => {
    if (!socket || !taskId) return
    socket.emit('join_task_room', { taskId })
    return () => {
      socket.emit('leave_task_room', { taskId })
    }
  }, [socket, taskId])
}
