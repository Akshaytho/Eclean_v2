import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { ChevronLeft, Send } from 'lucide-react-native'
import { COLORS }         from '../../constants/colors'
import { useSocketStore } from '../../stores/socketStore'
import { useAuthStore }   from '../../stores/authStore'
import type { ChatMessage } from '../../types'
import { apiClient }       from '../../api/client'

export function ChatScreen() {
  const navigation = useNavigation()
  const route      = useRoute()
  const params     = route.params as { taskId: string; title: string }
  const { taskId, title } = params

  const { user }                          = useAuthStore()
  const { socket, emit, joinTask, leaveTask } = useSocketStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Load chat history on mount
  // Backend: GET /buyer/tasks/:taskId/chat or /worker/tasks/:taskId/chat
  const historyQuery = useQuery({
    queryKey: ['chat-history', taskId],
    queryFn:  async () => {
      // Use correct route based on user role — avoids wasted 403 for workers
      const route = user?.role === 'BUYER'
        ? `/buyer/tasks/${taskId}/chat`
        : `/worker/tasks/${taskId}/chat`
      const r = await apiClient.get(route, { params: { limit: 50 } })
      return r.data.messages ?? []
    },
    staleTime: Infinity,
  })

  useEffect(() => {
    if (historyQuery.data && historyQuery.data.length > 0) {
      setMessages(historyQuery.data)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100)
    }
  }, [historyQuery.data])
  const [text,     setText]     = useState('')
  const listRef = useRef<FlatList>(null)

  useEffect(() => {
    joinTask(taskId)
    const MAX_MESSAGES = 500
    const handler = (msg: ChatMessage) => {
      setMessages(prev => {
        // Dedup: socket reconnect may re-deliver messages
        if (prev.some(m => m.id === msg.id)) return prev
        const next = [...prev, msg]
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
      })
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
    socket?.on('chat:message', handler)
    return () => {
      socket?.off('chat:message', handler)
      leaveTask(taskId)
    }
  }, [taskId, socket])

  const sendingRef = useRef(false)
  const send = () => {
    const content = text.trim()
    if (!content || sendingRef.current) return
    sendingRef.current = true

    if (socket?.connected) {
      emit('chat:send', { taskId, content })
    } else {
      apiClient.post(`/worker/tasks/${taskId}/chat`, { content }).catch(() => {
        Alert.alert('Message Not Sent', 'No connection. Please try again when online.')
      })
    }

    setText('')
    setTimeout(() => { sendingRef.current = false }, 500)
  }

  const isMe = (msg: ChatMessage) => msg.from?.id === user?.id

  if (historyQuery.isError) {
    return (
      <View style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <ChevronLeft size={22} color={COLORS.neutral[900]} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Chat</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, color: COLORS.neutral[500], textAlign: 'center' }}>
            Could not load chat. You may not have access to this conversation.
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={{ color: COLORS.brand.primary, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.headerSub}>Live chat</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={s.list}
        onLayout={() => listRef.current?.scrollToEnd()}
        removeClippedSubviews={true}
        windowSize={10}
        maxToRenderPerBatch={15}
        getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No messages yet</Text>
            <Text style={s.emptySub}>Start the conversation</Text>
          </View>
        }
        renderItem={({ item: msg }) => {
          const mine = isMe(msg)
          return (
            <View style={[s.bubble, mine ? s.bubbleMe : s.bubbleThem]}>
              {!mine && <Text style={s.senderName}>{msg.from?.name ?? 'Worker'}</Text>}
              <Text style={[s.bubbleText, mine && s.bubbleTextMe]}>{msg.content}</Text>
            </View>
          )
        }}
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.neutral[400]}
          onSubmitEditing={send}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity
          style={[s.sendBtn, !text.trim() && s.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim()}
          activeOpacity={0.8}
        >
          <Send size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: COLORS.background },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: COLORS.neutral[900] },
  headerSub:    { fontSize: 12, color: COLORS.brand.primary },
  list:         { padding: 16, gap: 10, flexGrow: 1 },
  bubble:       { maxWidth: '78%', borderRadius: 16, padding: 12 },
  bubbleMe:     { alignSelf: 'flex-end', backgroundColor: COLORS.brand.primary, borderBottomRightRadius: 4 },
  bubbleThem:   { alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  senderName:   { fontSize: 11, fontWeight: '600', color: COLORS.neutral[500], marginBottom: 4 },
  bubbleText:   { fontSize: 14, color: COLORS.neutral[900], lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  inputRow:     { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'flex-end' },
  input:        { flex: 1, backgroundColor: COLORS.neutral[100], borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: COLORS.neutral[900], maxHeight: 100 },
  sendBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.neutral[300] },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText:    { fontSize: 16, fontWeight: '600', color: COLORS.neutral[600] },
  emptySub:     { fontSize: 13, color: COLORS.neutral[400] },
})
